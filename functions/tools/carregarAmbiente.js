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

/**
 * Alvo: produção por padrão, staging só quando pedido explicitamente.
 *
 * Antes o projeto era uma constante fixa, então TODO script de tools/ falava
 * com produção — inclusive os de teste. Com um ambiente de staging existindo,
 * isso vira uma armadilha real: alguém roda um script achando que está no
 * ambiente de brincar e escreve no banco dos clientes pagantes.
 *
 * O padrão continua sendo produção de propósito. Nenhum comando que já existia
 * muda de comportamento; para ir ao staging é preciso dizer:
 *
 *   ALVO=staging node tools/algum-script.js        (bash)
 *   $env:ALVO="staging"; node tools/algum-script.js (PowerShell)
 */
const PROJETOS = {
  producao: 'financeiropessoal-29b32',
  staging: 'revelacash-staging',
};

const ALVO = String(process.env.ALVO || 'producao').toLowerCase();

if (!PROJETOS[ALVO]) {
  throw new Error(
    `ALVO="${process.env.ALVO}" não existe. Use "producao" ou "staging".`
  );
}

const PROJETO = PROJETOS[ALVO];
const EH_STAGING = ALVO === 'staging';

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
  // O anúncio de "em qual banco estou mexendo" fica em src/config/firebaseAdmin.js,
  // que é o ponto por onde todo script que fala com o Firestore passa
  // obrigatoriamente — inclusive os que não usam este carregador (src/seed.js).
  carregarArquivoEnv();

  const faltando = [];
  for (const nome of segredos) {
    if (!carregarSegredo(nome)) faltando.push(nome);
  }

  return { ok: faltando.length === 0, faltando };
}

module.exports = { carregar, PROJETO, ALVO, EH_STAGING, PROJETOS };
