/**
 * Fachada da assistente: junta as peças e é o único ponto que o controller
 * conhece.
 *
 * Existe para que a montagem (quem depende de quem) fique num lugar só, e para
 * que o controller não precise saber que existe orquestrador, catálogo de
 * consultas, ações de escrita, memória e cota — ele pede uma resposta e recebe
 * uma resposta.
 *
 * As dependências são carregadas com `require` preguiçoso dentro da fábrica
 * padrão porque `lancamentoPorMensagem` importa `firebaseAdmin` no topo, e sob
 * teste isso dispara a trava anti-produção (regra 2). A fábrica em si continua
 * injetável, então o serviço é testável sem tocar em Firestore.
 */

const INTERRUPTOR = 'ASSISTENTE_ATIVA';
const LISTA = 'ASSISTENTE_FAMILIAS';

/**
 * A feature está ligada para esta família?
 *
 * Dois controles, e a ordem importa:
 *
 * - `ASSISTENTE_FAMILIAS` é uma lista de householdIds. Existindo, SÓ elas têm
 *   a assistente — todas as outras seguem exatamente como antes, sem ver nada.
 *   É o que permite estrear a feature em produção com uma família de teste
 *   enquanto os clientes pagantes continuam intocados.
 * - `ASSISTENTE_ATIVA=false` desliga para todo mundo, inclusive a lista. É o
 *   botão de pânico: derruba a feature inteira sem deploy de código.
 *
 * Sem nenhuma das duas, a assistente vale para todos — que é o estado final,
 * depois do teste.
 */
function ativa(householdId) {
  if (String(process.env[INTERRUPTOR] || '').toLowerCase() === 'false') return false;

  const lista = String(process.env[LISTA] || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (!lista.length) return true;

  // Com lista configurada, quem não está nela não tem a feature. Uma chamada
  // sem householdId (um teste, um caminho que ainda não sabe a família) é
  // tratada como fora: liberar por omissão seria o erro mais caro aqui.
  return !!householdId && lista.includes(householdId);
}

function criarAssistente({ ia, sessoes, limite, escopoDe }) {
  /**
   * Uma pergunta, do pedido à resposta.
   *
   * A cota é consumida ANTES de falar com o modelo — cobrar depois deixaria
   * uma janela em que duas perguntas simultâneas passam as duas. E a resposta
   * traz o uso atualizado, para o painel mostrar a porcentagem sem uma segunda
   * chamada.
   */
  async function responder({ householdId, pergunta, interlocutor, permissoes, nomeDaIA, canal = 'PAINEL' }) {
    if (!ativa(householdId)) {
      return { erro: 'A assistente está temporariamente indisponível.', codigo: 'DESLIGADA' };
    }

    const texto = String(pergunta || '').trim();
    if (!texto) {
      return { erro: 'Escreva sua pergunta.', codigo: 'PERGUNTA_VAZIA' };
    }

    const cota = await limite.consumir(householdId);
    if (!cota.permitido) {
      return {
        erro: limite.mensagemDeLimite(),
        codigo: 'LIMITE_DIARIO',
        uso: { percentual: 100, esgotado: true },
      };
    }

    const dados = escopoDe(householdId);

    const resposta = await ia.responder({
      dados, pergunta: texto, interlocutor, permissoes, nomeDaIA, canal,
    });

    // A troca entra na memória mesmo quando o modelo falhou: sem isso, a
    // pergunta some e a pessoa não entende por que a IA "esqueceu" o assunto.
    await sessoes.registrarTroca(dados, interlocutor, {
      pergunta: texto,
      resposta: resposta.texto,
    });

    return {
      texto: resposta.texto,
      consultasUsadas: resposta.ferramentasUsadas || [],
      uso: {
        percentual: cota.percentual,
        esgotado: false,
      },
      ...(resposta.erro ? { avisoTecnico: resposta.erro } : {}),
    };
  }

  /**
   * Existe uma proposta esperando "sim" desta pessoa AGORA?
   *
   * Serve para o WhatsApp: a alteração e a exclusão acontecem em duas etapas,
   * e a resposta de confirmação é quase sempre uma palavra só — "sim", "ok",
   * "confirmo". O roteador trata isso como conversa fiada e descarta, então a
   * proposta ficava pendente para sempre e a pessoa não recebia nada. Ver o
   * comentário do desvio em evolutionWebhook.
   *
   * Proposta vencida conta como inexistente: gastar uma chamada de IA para
   * responder "expirou" a um "ok" solto sairia mais caro que o silêncio, e o
   * prazo é curto (10 minutos) de propósito.
   *
   * É a leitura de UM documento por ID, e só acontece nas mensagens que iam
   * ser descartadas de qualquer jeito.
   */
  async function temAcaoPendente({ householdId, interlocutor }) {
    if (!ativa(householdId) || !householdId || !interlocutor) return false;

    const pendente = await sessoes.lerAcaoPendente(escopoDe(householdId), interlocutor);
    if (!pendente) return false;

    if (pendente.expiraEm && new Date(pendente.expiraEm) <= new Date()) return false;

    return true;
  }

  /** Uso do dia, sem consumir. Alimenta a porcentagem no painel. */
  async function uso(householdId) {
    if (!ativa(householdId)) return { ativa: false };

    const atual = await limite.consultarUso(householdId);
    return {
      ativa: true,
      percentual: atual.percentual,
      esgotado: atual.esgotado,
    };
  }

  /** Esquece a conversa desta pessoa. */
  async function limparConversa({ householdId, interlocutor }) {
    await sessoes.limpar(escopoDe(householdId), interlocutor);
    return { limpo: true };
  }

  /** O histórico para a tela reabrir a conversa onde parou. */
  async function historico({ householdId, interlocutor }) {
    if (!ativa(householdId)) return { ativa: false, mensagens: [] };

    const mensagens = await sessoes.historico(escopoDe(householdId), interlocutor);
    return { ativa: true, mensagens };
  }

  return { responder, uso, limparConversa, historico, temAcaoPendente };
}

let _padrao = null;

function servico() {
  if (!_padrao) {
    const { escopoDe } = require('../data/escopo');
    const { criarConsultaFinanceira } = require('./consultaFinanceiraService');
    const { criarAcoesFinanceiras } = require('./acoesFinanceirasService');
    const { criarChatIA, chamarModeloReal } = require('./chatIAService');
    const { criarChatSessionService } = require('./chatSessionService');
    const limite = require('./limiteChatService');

    const transactionService = require('./transactionService');
    const categoryService = require('./categoryService');
    const subcategoryService = require('./subcategoryService');
    const budgetService = require('./budgetService');
    const recurringBillService = require('./recurringBillService');
    const { lancarPorTexto } = require('./lancamentoPorMensagem');

    const consulta = criarConsultaFinanceira({
      transactionService, categoryService, subcategoryService, budgetService, recurringBillService,
    });
    const sessoes = criarChatSessionService();
    const acoes = criarAcoesFinanceiras({
      transactionService, categoryService, subcategoryService, lancarPorTexto, sessoes,
    });
    const ia = criarChatIA({ consulta, acoes, sessoes, chamarModelo: chamarModeloReal });

    _padrao = criarAssistente({ ia, sessoes, limite, escopoDe });
  }
  return _padrao;
}

module.exports = {
  criarAssistente,
  ativa,
  INTERRUPTOR,
  LISTA,
  responder: (...args) => servico().responder(...args),
  uso: (...args) => servico().uso(...args),
  limparConversa: (...args) => servico().limparConversa(...args),
  historico: (...args) => servico().historico(...args),
  temAcaoPendente: (...args) => servico().temAcaoPendente(...args),
};
