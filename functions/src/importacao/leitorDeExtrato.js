const crypto = require('crypto');
const { lerOfx, ehOfx } = require('./ofxParser');
const { lerCsv, ehCsv } = require('./csvParser');

/**
 * Porta de entrada da importação: recebe o conteúdo do arquivo, descobre se é
 * OFX ou CSV e devolve as transações num formato só.
 *
 * Também é aqui que nasce a **impressão digital** de cada lançamento, que é o
 * que impede a mesma compra de entrar duas vezes quando alguém importa o
 * extrato de agosto e depois o de "julho a setembro". Sem isso, reimportar
 * duplicaria silenciosamente meses de histórico — e lançamento duplicado num
 * app de finanças destrói a confiança no saldo, que é a única coisa que o
 * produto vende.
 *
 * A impressão digital usa, em ordem de preferência:
 *   1. o ID da transação dado pelo próprio banco (`FITID` do OFX) — é único
 *      e estável, o melhor que existe;
 *   2. quando não há ID, um hash de data + valor + descrição normalizada.
 *
 * O caso 2 tem um limite conhecido e aceito: duas compras idênticas no mesmo
 * dia, no mesmo valor e no mesmo lugar (dois cafés de R$ 8,00 na mesma
 * padaria) geram a mesma digital, e a segunda aparece como duplicata. Como a
 * tela de conferência deixa o usuário marcar de volta, errar para o lado de
 * "avisar demais" é melhor que duplicar em silêncio.
 */

const LIMITE_DE_LINHAS = 2000;

function normalizarDescricao(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Números que mudam a cada compra (NSU, autorização, parcela) não podem
    // entrar na digital, senão a MESMA compra reimportada gera digital nova.
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function impressaoDigital({ data, valor, descricao, idDoBanco }) {
  const base = idDoBanco
    ? `banco:${idDoBanco}`
    : `calc:${data}|${valor.toFixed(2)}|${normalizarDescricao(descricao)}`;

  return crypto.createHash('sha256').update(base).digest('hex').slice(0, 32);
}

/**
 * Detecta o formato pelo CONTEÚDO, não pela extensão do arquivo: gente renomeia
 * arquivo, e o app do banco às vezes entrega OFX com extensão .txt.
 */
function detectarFormato(conteudo) {
  if (ehOfx(conteudo)) return 'ofx';
  if (ehCsv(conteudo)) return 'csv';
  return null;
}

/**
 * @param {string} conteudo  texto do arquivo já decodificado
 * @returns {{formato, transacoes, ignoradas, conta, colunas, periodo}}
 */
function lerExtrato(conteudo) {
  if (!conteudo || !String(conteudo).trim()) {
    throw Object.assign(new Error('Arquivo vazio.'), { statusCode: 400, codigo: 'ARQUIVO_VAZIO' });
  }

  const formato = detectarFormato(conteudo);
  if (!formato) {
    throw Object.assign(
      new Error('Não reconheci este arquivo. Envie o extrato em OFX ou CSV, como o banco exporta.'),
      { statusCode: 400, codigo: 'FORMATO_DESCONHECIDO' },
    );
  }

  const lido = formato === 'ofx' ? lerOfx(conteudo) : lerCsv(conteudo);

  if (lido.transacoes.length > LIMITE_DE_LINHAS) {
    throw Object.assign(
      new Error(`Este arquivo tem ${lido.transacoes.length} lançamentos. O limite por importação é ${LIMITE_DE_LINHAS} — divida por período e importe em partes.`),
      { statusCode: 413, codigo: 'ARQUIVO_GRANDE' },
    );
  }

  const transacoes = lido.transacoes.map((t) => ({
    ...t,
    digital: impressaoDigital(t),
  }));

  return {
    formato,
    transacoes,
    ignoradas: lido.ignoradas,
    conta: lido.conta || null,
    colunas: lido.colunas || null,
    periodo: periodoDe(transacoes),
    duplicatasNoArquivo: duplicatasInternas(transacoes),
  };
}

/** Primeira e última data — a tela mostra para a pessoa conferir se é o mês certo. */
function periodoDe(transacoes) {
  if (!transacoes.length) return null;
  const datas = transacoes.map((t) => t.data).sort();
  return { de: datas[0], ate: datas[datas.length - 1] };
}

/**
 * Repetição DENTRO do próprio arquivo (o banco listou a mesma transação duas
 * vezes, ou o usuário colou dois extratos no mesmo CSV). Diferente de
 * duplicata contra o que já está no banco de dados, que só o serviço sabe
 * conferir.
 */
function duplicatasInternas(transacoes) {
  const vistas = new Set();
  const repetidas = new Set();

  for (const t of transacoes) {
    if (vistas.has(t.digital)) repetidas.add(t.digital);
    vistas.add(t.digital);
  }

  return [...repetidas];
}

module.exports = {
  lerExtrato,
  detectarFormato,
  impressaoDigital,
  normalizarDescricao,
  LIMITE_DE_LINHAS,
};
