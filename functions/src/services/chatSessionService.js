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

// Por quanto tempo uma pergunta da assistente segue "no ar" esperando resposta.
// Curto: é o intervalo em que alguém responde a uma pergunta que acabou de ler.
// Passou disso, a próxima mensagem é assunto novo e volta a ser tratada como
// lançamento, que é o caminho barato e o principal do produto.
const MINUTOS_ESPERANDO_RESPOSTA = 10;

/** Deixa o interlocutor utilizável como pedaço de ID de documento. */
function chaveDoInterlocutor(interlocutor) {
  return String(interlocutor || 'desconhecido')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
}

function idDaSessao(householdId, interlocutor) {
  return `${householdId}__${chaveDoInterlocutor(interlocutor)}`;
}

/**
 * A resposta da assistente contém uma pergunta?
 *
 * Procura o "?" em qualquer lugar, não só no fim. A resposta que expôs o
 * problema pedia duas informações no meio e terminava com "Assim que me passar
 * esses dados, eu cadastro" — exigir o "?" no fim não pegaria nenhuma delas.
 *
 * Errar para o lado do "perguntou" é barato: no máximo uma mensagem seguinte
 * vai para a assistente em vez do parser, e a assistente também sabe lançar.
 */
function perguntou(resposta) {
  return String(resposta || '').includes('?');
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

    // A assistente devolveu uma pergunta? Então a próxima mensagem desta pessoa
    // é provavelmente a RESPOSTA, e não um lançamento novo. Ver
    // `esperandoResposta` abaixo.
    const esperandoRespostaAte = perguntou(resposta)
      ? new Date(agora().getTime() + MINUTOS_ESPERANDO_RESPOSTA * 60 * 1000).toISOString()
      : null;

    const conteudo = {
      interlocutor: String(interlocutor || ''),
      mensagens,
      expiraEm,
      esperandoRespostaAte,
    };

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

  /**
   * A assistente fez uma pergunta e ainda espera a resposta?
   *
   * Existe por um caso real: "cadastra minha internet como conta fixa" fez a
   * Nina pedir o valor e o dia; a pessoa respondeu **"139,90 dia 10"** e isso
   * virou uma DESPESA de R$ 139,90 em Outros — o parser viu um valor e fez o
   * que sempre fez. A conta fixa nunca foi cadastrada e ainda sobrou um
   * lançamento fantasma. Aconteceu duas vezes no teste ao vivo de 20/08/2026.
   *
   * A janela é curta e a barreira do lançamento vem antes: mensagem que o
   * parser por regra entende ("gastei 45 no mercado") continua sendo
   * lançamento mesmo com uma pergunta no ar.
   */
  async function esperandoResposta(dados, interlocutor) {
    const doc = await dados.buscarDoc('chatSessions', idDaSessao(dados.householdId, interlocutor));
    if (!doc?.esperandoRespostaAte) return false;

    const ate = doc.esperandoRespostaAte?.toDate?.() || new Date(doc.esperandoRespostaAte);
    return ate > agora();
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
    esperandoResposta,
  };
}

module.exports = {
  criarChatSessionService,
  idDaSessao,
  chaveDoInterlocutor,
  perguntou,
  MAX_TROCAS,
  HORAS_DE_VALIDADE,
  MINUTOS_ESPERANDO_RESPOSTA,
};
