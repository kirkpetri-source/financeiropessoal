const { reconhecerChamado } = require('./nomeDaAssistente');

/**
 * Para onde vai uma mensagem que chegou pelo WhatsApp.
 *
 * Função PURA, sem banco e sem IA, para a decisão poder ser exercitada com uma
 * bateria grande de mensagens reais. O roteador é a peça de maior risco da
 * assistente: ele fica no caminho do lançamento, que é a função principal do
 * produto, e um erro aqui não gera erro — gera um gasto que virou conversa ou
 * uma conversa que virou lançamento fantasma.
 *
 * A ORDEM É A GARANTIA. Do mais explícito ao mais genérico:
 *
 * 1. Chamou pelo nome        -> CHAT     (a pessoa disse com todas as letras)
 * 2. Comando conhecido       -> COMANDO  (resumo, ultimos... resposta de graça)
 * 3. Regra de lançamento     -> LANCAMENTO  ← o caminho de hoje, INTOCADO
 * 4. Intenção dita pela IA   -> CHAT ou LANCAMENTO
 *
 * O passo 3 é o que protege o produto: mensagem que o parser por regra entende
 * nunca chega perto da assistente, nunca gasta IA e nunca muda de comportamento
 * em relação ao que já funcionava.
 *
 * FRONTEIRA CONHECIDA E ACEITA: "gastei 200 no mercado, tá muito?" casa na
 * regra e vira lançamento. A pessoa gastou mesmo — registrar é o certo. Para
 * conversar sobre isso, ela chama pelo nome, e aí o passo 1 resolve.
 */

const DESTINO = {
  CHAT: 'CHAT',
  COMANDO: 'COMANDO',
  LANCAMENTO: 'LANCAMENTO',
  IGNORAR: 'IGNORAR',
};

// Aberturas de pergunta e de pedido. Não é para entender a frase — é só para
// saber se vale a pena gastar a chamada de IA que vai classificá-la.
const ABERTURAS = [
  'quanto', 'quais', 'qual', 'como', 'quando', 'onde', 'porque', 'por que',
  'quem', 'me da', 'me de', 'me diga', 'me mostra', 'me mostre', 'mostra',
  'mostre', 'lista', 'liste', 'apaga', 'apague', 'muda', 'mude', 'troca',
  'troque', 'altera', 'altere', 'corrige', 'corrija', 'registra', 'registre',
  'anota', 'anote', 'sugere', 'sugira', 'sugestao', 'compara', 'compare',
  'estou', 'consigo', 'posso', 'preciso', 'tenho',
];

/**
 * A mensagem parece uma pergunta ou um pedido?
 *
 * Existe porque `looksLikeFinancialMessage` (o filtro barato que protege a IA
 * de lançamento) responde NÃO para toda pergunta — ele procura valor e palavra
 * de gasto, e "quanto gastei em mercado?" não tem valor nenhum.
 *
 * Isso derrubou o primeiro teste ao vivo: com a assistente no ar, perguntas sem
 * o nome eram descartadas em silêncio, antes mesmo de virar log. A pessoa
 * perguntava e não acontecia nada.
 *
 * Deliberadamente permissivo — errar para o lado de deixar passar custa uma
 * classificação de IA que já ia acontecer nesse caminho; errar para o outro
 * lado é a pessoa falar com o sistema e ser ignorada. "bom dia" continua de
 * fora, que é o caso que o filtro precisa barrar.
 */
function pareceperguntaOuPedido(texto) {
  const limpo = String(texto || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  if (!limpo) return false;
  if (limpo.includes('?')) return true;

  return ABERTURAS.some((a) => limpo === a || limpo.startsWith(`${a} `));
}

/**
 * Decisão que não precisa de IA. É o que o webhook consulta ANTES de gastar
 * qualquer coisa.
 *
 * @param {object} p
 * @param {string} p.texto
 * @param {string} p.nomeDaAssistente
 * @param {boolean} p.ehComando        a mensagem casou com um comando conhecido
 * @param {boolean} [p.casouRegra]     o parser por regra entendeu a mensagem.
 *   OPCIONAL: quem já sabe (um teste, ou um chamador que rodou o parser)
 *   informa e recebe LANCAMENTO na hora. O webhook NÃO informa — descobrir
 *   custaria rodar o parser e buscar os membros da família de novo, sendo que
 *   `lancarPorTexto` já faz exatamente isso logo em seguida. Sem o parâmetro, a
 *   decisão devolve destino nulo e o fluxo de lançamento segue como sempre.
 * @param {boolean} p.assistenteAtiva  a feature está ligada para esta família
 * @returns {{destino: string|null, texto: string, motivo: string}}
 */
function decidirSemIA({ texto, nomeDaAssistente, ehComando, casouRegra, assistenteAtiva = true }) {
  const mensagem = String(texto || '').trim();

  if (!mensagem) return { destino: DESTINO.IGNORAR, texto: '', motivo: 'VAZIA' };

  // 1. Chamado explícito vence tudo — inclusive frase que parece lançamento.
  //    Com o nome na frente, a pessoa disse para onde quer ir.
  if (assistenteAtiva) {
    const chamado = reconhecerChamado(mensagem, nomeDaAssistente);
    if (chamado.chamou) {
      return { destino: DESTINO.CHAT, texto: chamado.resto, motivo: 'CHAMOU_PELO_NOME' };
    }
  }

  // 2. Comando conhecido: responde sem IA, de graça.
  if (ehComando) {
    return { destino: DESTINO.COMANDO, texto: mensagem, motivo: 'COMANDO' };
  }

  // 3. O parser por regra entendeu: lançamento, exatamente como antes da
  //    assistente existir. Este é o caminho que não pode regredir.
  if (casouRegra) {
    return { destino: DESTINO.LANCAMENTO, texto: mensagem, motivo: 'REGRA_DE_LANCAMENTO' };
  }

  // 4. Precisa da IA para saber o que é. Quem chama decide se vale o custo.
  return { destino: null, texto: mensagem, motivo: 'INDEFINIDO' };
}

/**
 * Decisão depois que a IA classificou a intenção.
 *
 * Só é consultada quando `decidirSemIA` devolveu destino nulo — ou seja,
 * quando a chamada de IA ia acontecer de qualquer jeito.
 *
 * @param {string} intencao  LANCAMENTO | PERGUNTA | OUTRO
 */
function decidirComIntencao({ texto, intencao, assistenteAtiva = true, temLancamentos }) {
  const mensagem = String(texto || '').trim();

  if (intencao === 'PERGUNTA') {
    // Sem assistente disponível, uma pergunta não tem para onde ir. Devolver
    // LANCAMENTO faria o fluxo antigo responder "não entendi", que é o
    // comportamento de sempre — melhor que silêncio.
    return assistenteAtiva
      ? { destino: DESTINO.CHAT, texto: mensagem, motivo: 'IA_DISSE_PERGUNTA' }
      : { destino: DESTINO.LANCAMENTO, texto: mensagem, motivo: 'PERGUNTA_SEM_ASSISTENTE' };
  }

  // A IA disse que não é nem uma coisa nem outra E não extraiu lançamento
  // nenhum: era conversa. Responder "não entendi" a um "bom dia" é ruído.
  if (intencao === 'OUTRO' && !temLancamentos) {
    return { destino: DESTINO.IGNORAR, texto: mensagem, motivo: 'IA_DISSE_OUTRO' };
  }

  return { destino: DESTINO.LANCAMENTO, texto: mensagem, motivo: 'IA_DISSE_LANCAMENTO' };
}

module.exports = { decidirSemIA, decidirComIntencao, pareceperguntaOuPedido, DESTINO };
