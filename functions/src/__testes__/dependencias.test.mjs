import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(AQUI, '..');

/**
 * Detecta dependência circular entre módulos do src/.
 *
 * Motivo concreto: householdService importava comandosWhatsapp, que importava
 * householdService de volta. Dependendo de qual carregasse primeiro,
 * gerarCodigoVinculo chegava como `undefined` — e a criação de conta de cliente
 * novo quebrava. O Node só emite um warning, que passa despercebido no log de
 * deploy. Aqui o ciclo vira teste vermelho.
 */

function listarArquivos(dir, acumulado = []) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules') continue;
      listarArquivos(caminho, acumulado);
    } else if (entrada.name.endsWith('.js') && !entrada.name.includes('.test.')) {
      acumulado.push(caminho);
    }
  }
  return acumulado;
}

function resolverImport(arquivo, especificador) {
  if (!especificador.startsWith('.')) return null; // pacote externo
  const base = resolve(dirname(arquivo), especificador);
  for (const tentativa of [base, `${base}.js`, join(base, 'index.js')]) {
    if (existsSync(tentativa) && tentativa.endsWith('.js')) return tentativa;
  }
  return null;
}

function montarGrafo() {
  const grafo = new Map();

  for (const arquivo of listarArquivos(SRC)) {
    const conteudo = readFileSync(arquivo, 'utf8');
    const destinos = new Set();

    // Só require de topo de módulo conta. require() dentro de função é a saída
    // legítima para quebrar ciclo e não deve ser acusado aqui.
    for (const linha of conteudo.split('\n')) {
      if (/^\s{2,}/.test(linha)) continue; // indentado = dentro de função
      const achado = linha.match(/require\(['"]([^'"]+)['"]\)/);
      if (!achado) continue;
      const destino = resolverImport(arquivo, achado[1]);
      if (destino) destinos.add(destino);
    }

    grafo.set(arquivo, [...destinos]);
  }

  return grafo;
}

function acharCiclos(grafo) {
  const ciclos = [];
  const visitando = new Set();
  const visitado = new Set();

  function percorrer(no, caminho) {
    if (visitando.has(no)) {
      const inicio = caminho.indexOf(no);
      ciclos.push([...caminho.slice(inicio), no].map((c) => c.replace(SRC, 'src')));
      return;
    }
    if (visitado.has(no)) return;

    visitando.add(no);
    for (const vizinho of grafo.get(no) || []) {
      percorrer(vizinho, [...caminho, no]);
    }
    visitando.delete(no);
    visitado.add(no);
  }

  for (const no of grafo.keys()) percorrer(no, []);
  return ciclos;
}

describe('dependências entre módulos', () => {
  it('não existe ciclo de require no topo dos módulos', () => {
    const ciclos = acharCiclos(montarGrafo());

    if (ciclos.length) {
      const descricao = ciclos
        .map((c) => c.join('\n    -> '))
        .join('\n\n  ');
      expect.fail(`Dependência circular encontrada:\n\n  ${descricao}\n\n` +
        'Mova o que é compartilhado para um módulo folha (sem imports), ' +
        'ou faça o require dentro da função que usa.');
    }

    expect(ciclos).toHaveLength(0);
  });
});
