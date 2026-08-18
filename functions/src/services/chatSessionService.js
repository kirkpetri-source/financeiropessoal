/**
 * Memória curta da conversa com o consultor de IA.
 *
 * É o que faz "e o mês passado?" funcionar sem a pessoa repetir o assunto
 * inteiro. Guarda as últimas trocas, não a conversa toda: o histórico entra no
 * prompt a cada pergunta, então memória longa é custo de IA em toda mensagem,
 * pago para sempre por um contexto que quase nunca é usado.
 *
 * CHAVEADA POR FAMÍLIA **E INTERLOCUTOR**, não só por família. No modo grupo do
 * WhatsApp até 8 pessoas usam o mesmo canal: com sessão por família, o "e o mês
 * passado?" do Kirk continuaria a conversa que a Raquel estava tendo, com
 * resposta errada e sem ninguém entender por quê.
 *
 * O ID do documento é determinístico (família + interlocutor) de propósito:
 * evita uma query com duas igualdades, que no Firestore pediria índice
 * composto — e o dublê de banco dos testes não reproduz essa exigência
 * (regra 12 do projeto).
 */

// Quantas trocas (pergunta + resposta) ficam na memória.
const MAX_TROCAS = 8;

// Depois disso a conversa é considerada encerrada. Curto de propósito: retomar
// contexto de ontem quase sempre atrapalha mais do que ajuda, e dado financeiro
// parado é dado exposto à toa.
const HORAS_DE_VALIDADE = 6;

/** Deixa o interlocutor utilizável como pedaço de ID de documento. */
function chaveDoInterlocutor(interlocutor) {
  return String(interlocutor || 'desconhecido')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
}

function idDaSessao(householdId, interlocutor) {
  return `${householdId}__${chaveDoInterlocutor(interlocutor)}`;
}

function criarChatSessionService({ agora = () => new Date() } = {}) {
  /**
   * Histórico ainda válido desta pessoa. Sessão expirada devolve vazio em vez
   * de contexto velho.
   *
   * A expiração é conferida NA LEITURA, e não só delegada ao TTL do Firestore:
   * o TTL apaga em algum momento dentro de ~24h, não na hora. Confiar só nele
   * significaria continuar uma conversa de ontem achando que é de agora.
   */
  async function historico(dados, interlocutor) {
    const doc = await dados.buscarDoc('chatSessions', idDaSessao(dados.householdId, interlocutor));
    if (!doc) return [];

    const expira = doc.expiraEm?.toDate?.() || (doc.expiraEm ? new Date(doc.expiraEm) : null);
    if (expira && expira <= agora()) return [];

    return Array.isArray(doc.mensagens) ? doc.mensagens : [];
  }

  /**
   * Grava a troca (o que a pessoa perguntou e o que a IA respondeu) e devolve o
   * histórico já podado.
   */
  async function registrarTroca(dados, interlocutor, { pergunta, resposta }) {
    const id = idDaSessao(dados.householdId, interlocutor);
    const agoraISO = agora().toISOString();
    const expiraEm = new Date(agora().getTime() + HORAS_DE_VALIDADE * 3600 * 1000);

    const anterior = await historico(dados, interlocutor);

    const mensagens = [
      ...anterior,
      { papel: 'usuario', texto: String(pergunta || ''), em: agoraISO },
      { papel: 'assistente', texto: String(resposta || ''), em: agoraISO },
    ].slice(-MAX_TROCAS * 2);

    const conteudo = { interlocutor: String(interlocutor || ''), mensagens, expiraEm };

    const existente = await dados.buscarDoc('chatSessions', id);
    if (existente) await dados.atualizar('chatSessions', id, conteudo);
    else await dados.criarComId('chatSessions', id, conteudo);

    return mensagens;
  }

  /** Esquece a conversa desta pessoa. Usado quando ela pede para recomeçar. */
  async function limpar(dados, interlocutor) {
    const id = idDaSessao(dados.householdId, interlocutor);
    const existente = await dados.buscarDoc('chatSessions', id);
    if (existente) await dados.remover('chatSessions', id);
  }

  /**
   * Ação de escrita esperando o "sim" do cliente.
   *
   * Mora AQUI, no servidor, e não na memória do modelo, porque é isto que
   * impede a assistente de executar uma alteração que ela não propôs antes:
   * sem pendência gravada, a confirmação não tem o que executar. Fica no mesmo
   * documento da conversa por já ser um por família + pessoa, e por expirar
   * junto com ela.
   */
  async function definirAcaoPendente(dados, interlocutor, acao) {
    const id = idDaSessao(dados.householdId, interlocutor);
    const existente = await dados.buscarDoc('chatSessions', id);

    if (existente) {
      await dados.atualizar('chatSessions', id, { acaoPendente: acao });
    } else {
      await dados.criarComId('chatSessions', id, {
        interlocutor: String(interlocutor || ''),
        mensagens: [],
        acaoPendente: acao,
        expiraEm: new Date(agora().getTime() + HORAS_DE_VALIDADE * 3600 * 1000),
      });
    }
  }

  async function lerAcaoPendente(dados, interlocutor) {
    const doc = await dados.buscarDoc('chatSessions', idDaSessao(dados.householdId, interlocutor));
    return doc?.acaoPendente || null;
  }

  async function limparAcaoPendente(dados, interlocutor) {
    const id = idDaSessao(dados.householdId, interlocutor);
    const existente = await dados.buscarDoc('chatSessions', id);
    if (existente) await dados.atualizar('chatSessions', id, { acaoPendente: null });
  }

  return {
    historico,
    registrarTroca,
    limpar,
    definirAcaoPendente,
    lerAcaoPendente,
    limparAcaoPendente,
  };
}

module.exports = {
  criarChatSessionService,
  idDaSessao,
  chaveDoInterlocutor,
  MAX_TROCAS,
  HORAS_DE_VALIDADE,
};
