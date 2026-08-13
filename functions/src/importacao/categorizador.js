/**
 * Categorização dos lançamentos importados, em duas camadas.
 *
 * O problema que isto resolve: um extrato tem 50 a 300 linhas. Mandar cada
 * linha para a IA seria 300 chamadas — o teto diário por família é 60
 * (`limiteIAService`) e a chave do Gemini é a MESMA para todos os clientes,
 * então uma importação grande derrubaria a IA do sistema inteiro e ainda
 * custaria caro num produto de assinatura fixa (R$ 24,90).
 *
 * Por isso:
 *
 *   Camada 1 — regras (`suggestCategory`, o mesmo do WhatsApp). Custo zero,
 *              instantâneo, resolve o que tem palavra conhecida ("mercado",
 *              "posto", "farmácia").
 *   Camada 2 — IA, UMA chamada só, levando as descrições distintas que
 *              sobraram. Descrição de banco se repete muito ("PAG*IFOOD"
 *              aparece 12 vezes no mês), então deduplicar antes costuma
 *              reduzir bastante o que vai para a IA.
 *
 * A camada 2 nunca é obrigatória: se a IA falhar, estourar o teto ou não
 * estiver configurada, o que sobrou fica em "Outros" e a importação continua.
 * Categoria errada o usuário corrige na tela; importação que não acontece é
 * cliente perdido.
 */

const { suggestCategory } = require('../utils/financialParser');

/** Máximo de descrições numa chamada — prompt gigante degrada a resposta do modelo. */
const LOTE_MAXIMO = 80;

/**
 * Limpa o ruído que todo extrato bancário carrega antes de tentar entender a
 * descrição. "PAG*MERCADO BOM PRECO 08/26 NSU 123456" vira "MERCADO BOM
 * PRECO" — sem isso, nem a regra nem a IA acertam, porque o texto está
 * enterrado em código de máquina.
 */
const RUIDO = [
  /\bPAG\*/gi, /\bPAGTO\b/gi, /\bCOMPRA\s+(CARTAO|DEBITO|CREDITO)\b/gi,
  /\bNSU\s*\d+/gi, /\bAUT\s*\d+/gi, /\bDOC\s*\d+/gi, /\bTED\b/gi,
  /\bPIX\s+(ENVIADO|RECEBIDO)\b/gi, /\bTRANSFERENCIA\s+(ENVIADA|RECEBIDA)\b/gi,
  /\bCART[AÃ]O\s+FINAL\s*\d+/gi, /\b\d{2}\/\d{2}(\/\d{2,4})?\b/g,
  /\s{2,}/g,
];

function limparDescricao(bruta) {
  let texto = String(bruta || '');
  for (const padrao of RUIDO) texto = texto.replace(padrao, ' ');
  return texto.replace(/\s+/g, ' ').trim() || String(bruta || '').trim();
}

/**
 * Transferência entre contas da própria pessoa não é gasto nem receita — é
 * dinheiro trocando de bolso. Se entrar como despesa, infla o total do mês e
 * o gráfico de categorias vira mentira. Marcadas para a tela sugerir ignorar,
 * mas quem decide é o usuário: às vezes um Pix recebido É renda de verdade.
 */
const PADROES_DE_TRANSFERENCIA = [
  /\baplica[çc][ãa]o\b/i, /\bresgate\b/i, /\bpoupan[çc]a\b/i,
  /\brendimento\b/i, /\bsaldo\s+anterior\b/i, /\btransfer[êe]ncia\s+entre\s+contas\b/i,
  /\bCDB\b/i, /\btesouro\s+direto\b/i, /\binvestimento\b/i,
];

function pareceTransferencia(descricao) {
  return PADROES_DE_TRANSFERENCIA.some((p) => p.test(descricao || ''));
}

const CONFIANCA = {
  REGRA: 'regra',       // palavra-chave bateu — alta confiança
  IA: 'ia',             // palpite do modelo — vale revisar
  PADRAO: 'padrao',     // ninguém soube: caiu em Outros
};

/**
 * Categoriza a lista inteira.
 *
 * @param {Array} transacoes  saída do leitor de extrato
 * @param {{resolverComIA?: Function}} opcoes  IA injetada (null desliga a camada 2)
 * @returns {Promise<Array>} mesma lista, com `categoriaSugerida`, `confianca` e `descricaoLimpa`
 */
async function categorizar(transacoes, { resolverComIA = null } = {}) {
  const comRegra = transacoes.map((t) => {
    const descricaoLimpa = limparDescricao(t.descricao);
    const categoria = suggestCategory(descricaoLimpa, t.tipo);

    return {
      ...t,
      descricaoLimpa,
      ehTransferencia: pareceTransferencia(t.descricao),
      // suggestCategory devolve 'Outros' quando não reconhece: isso não é
      // uma categorização de verdade, é a ausência dela.
      categoriaSugerida: categoria && categoria !== 'Outros' ? categoria : null,
      confianca: categoria && categoria !== 'Outros' ? CONFIANCA.REGRA : null,
    };
  });

  const pendentes = comRegra.filter((t) => !t.categoriaSugerida && !t.ehTransferencia);

  if (!resolverComIA || !pendentes.length) {
    return comRegra.map(finalizar);
  }

  // Descrições distintas: "PAG*IFOOD" 12 vezes no mês é uma pergunta, não 12.
  const distintas = [...new Set(pendentes.map((t) => t.descricaoLimpa))].slice(0, LOTE_MAXIMO);

  let mapa = {};
  try {
    mapa = (await resolverComIA(distintas)) || {};
  } catch (err) {
    // Falha de IA não derruba a importação: o que sobrar vira "Outros".
    console.error('[Importação] IA falhou ao categorizar, seguindo sem ela:', err.message);
  }

  return comRegra.map((t) => {
    if (t.categoriaSugerida || t.ehTransferencia) return finalizar(t);

    const daIA = mapa[t.descricaoLimpa];
    if (daIA) return finalizar({ ...t, categoriaSugerida: daIA, confianca: CONFIANCA.IA });
    return finalizar(t);
  });
}

function finalizar(t) {
  return {
    ...t,
    categoriaSugerida: t.categoriaSugerida || 'Outros',
    confianca: t.confianca || CONFIANCA.PADRAO,
  };
}

module.exports = {
  categorizar,
  limparDescricao,
  pareceTransferencia,
  CONFIANCA,
  LOTE_MAXIMO,
};
