/**
 * Carrega o ambiente para os scripts de tools/ rodarem sozinhos.
 *
 * Em produção o Firebase injeta as variáveis do `.env.<projeto>` e os segredos
 * do Secret Manager. Rodando na máquina, nada disso acontece — e exigir que a
 * pessoa exporte cinco variáveis à mão antes de cada teste é justamente o tipo
 * de fricção que estes scripts existem para eliminar.
 *
 * Ordem: o que já está no ambiente vence, depois o .env do projeto, e por
 * último o Secret Manager (via firebase CLI, que já está autenticado).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJETO = 'financeiropessoal-29b32';

function carregarArquivoEnv() {
  const caminho = path.join(__dirname, '..', `.env.${PROJETO}`);
  if (!fs.existsSync(caminho)) return [];

  const carregadas = [];

  for (const linha of fs.readFileSync(caminho, 'utf8').split('\n')) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;

    const igual = limpa.indexOf('=');
    if (igual === -1) continue;

    const chave = limpa.slice(0, igual).trim();
    const valor = limpa.slice(igual + 1).trim().replace(/^["']|["']$/g, '');

    if (!process.env[chave]) {
      process.env[chave] = valor;
      carregadas.push(chave);
    }
  }

  return carregadas;
}

/** Busca um segredo pelo firebase CLI. Nunca imprime o valor. */
function carregarSegredo(nome) {
  if (process.env[nome]) return 'ambiente';

  try {
    // execSync com shell, e não execFileSync: no Windows o firebase é um .cmd,
    // que só resolve passando pelo shell. Sem isso, ENOENT em silêncio.
    const valor = execSync(
      `firebase functions:secrets:access ${nome} --project ${PROJETO}`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();

    if (!valor) return null;
    process.env[nome] = valor;
    return 'secret manager';
  } catch {
    return null;
  }
}

/**
 * @param {string[]} segredos nomes a buscar no Secret Manager
 * @returns {{ok: boolean, faltando: string[]}}
 */
function carregar(segredos = []) {
  carregarArquivoEnv();

  const faltando = [];
  for (const nome of segredos) {
    if (!carregarSegredo(nome)) faltando.push(nome);
  }

  return { ok: faltando.length === 0, faltando };
}

module.exports = { carregar, PROJETO };
