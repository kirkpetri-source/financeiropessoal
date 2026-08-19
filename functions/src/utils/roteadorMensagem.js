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

/**
 * Conversa que não pede resposta. É a lista do que NÃO passa — e ela é curta,
 * fechada e estável, ao contrário da lista de "jeitos de perguntar", que é
 * infinita.
 *
 * Só bloqueia quando a mensagem é ISSO e nada mais: "ok" sozinho é
 * confirmação, "ok, e quanto gastei?" é pergunta.
 */
const CONVERSA_FIADA = new Set([
  'oi', 'ola', 'opa', 'e ai', 'eai', 'fala', 'alo',
  'bom dia', 'boa tarde', 'boa noite', 'bom dia!', 'boa tarde!', 'boa noite!',
  'obrigado', 'obrigada', 'obg', 'valeu', 'vlw', 'brigado', 'brigada',
  'ok', 'okay', 'blz', 'beleza', 'certo', 'isso', 'isso mesmo', 'perfeito',
  'sim', 'nao', 'claro', 'ta', 'ta bom', 'tudo bem', 'entendi', 'show',
  'kkk', 'kkkk', 'kkkkk', 'rs', 'rsrs', 'haha', 'hahaha', 'ata',
  'tchau', 'falou', 'ate mais', 'ate logo', 'boa', 'legal', 'top', 'otimo',
]);

/**
 * Vale gastar a classificação de IA nesta mensagem?
 *
 * A LÓGICA É INVERTIDA DE PROPÓSITO: deixa passar tudo, menos a conversa que
 * claramente não pede resposta.
 *
 * A primeira versão fazia o contrário — tinha uma lista de aberturas de
 * pergunta ("quanto", "quais", "como"...) e só elas passavam. Falhou duas
 * vezes em produção no mesmo dia: "Quanto gastei em mercado?" passava, mas
 * "Detalhe os gastos de moradia" era descartada em silêncio, porque "detalhe"
 * não estava na lista. Português tem jeitos demais de pedir a mesma coisa —
 * "detalha", "explica", "abre", "separa", "quero ver", "resume".
 *
 * É a mesma armadilha que o `CATEGORY_MAP` do parser já cobrou deste projeto:
 * lista fechada de palavras-chave falha em SILÊNCIO quando a vida real traz
 * uma palavra que não está nela.
 *
 * Invertendo, o erro muda de lado — e de tamanho. Antes: a pessoa fala com o
 * sistema e é ignorada, sem log, sem pista. Agora: no pior caso gasta-se uma
 * classificação de IA à toa, que é barata e já acontecia no fluxo antigo para
 * essas mesmas mensagens.
 */
function pareceperguntaOuPedido(texto) {
  const limpo = String(texto || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[!.,;]+$/, '')
    .replace(/\s+/g, ' ');

  if (!limpo) return false;

  // Emoji ou pontuação solta não é pergunta.
  if (!/\p{L}|\d/u.test(limpo)) return false;

  return !CONVERSA_FIADA.has(limpo);
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

// Quantas palavras já fazem uma mensagem deixar de ser "valeu, tá ótimo".
const PALAVRAS_DE_FRASE = 5;

/**
 * A mensagem é pergunta ou pedido, mesmo a IA tendo dito que não é nem
 * lançamento nem pergunta?
 *
 * Dois sinais baratos e que não dependem de vocabulário — a lição do
 * `CATEGORY_MAP` e da lista de aberturas de pergunta: o ponto de interrogação,
 * e o tamanho. "Qual seu nome?" tem o primeiro; "me fale o nome de uma família
 * que não seja a minha" tem o segundo. "valeu mesmo" não tem nenhum dos dois.
 */
function ehPerguntaOuPedidoLongo(texto) {
  const limpo = String(texto || '').trim();
  if (!limpo) return false;

  if (limpo.includes('?')) return true;

  return limpo.split(/\s+/).filter(Boolean).length >= PALAVRAS_DE_FRASE;
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
  //
  // MAS a classificação erra para o lado do silêncio, que é o erro caro deste
  // projeto. "Qual seu nome?" — pergunta legítima, dirigida à assistente —
  // voltou OUTRO no teste ao vivo de 19/08/2026 e foi descartada sem resposta
  // nenhuma. Só que a pessoa perguntou. Por isso o OUTRO só ignora quando a
  // mensagem também PARECE conversa fiada: sem ponto de interrogação e curta.
  // Frase longa ou com "?" é pedido, mesmo que a IA não tenha sabido dizer de
  // quê — e aí ir para a assistente custa uma resposta, não um silêncio.
  if (intencao === 'OUTRO' && !temLancamentos) {
    if (!ehPerguntaOuPedidoLongo(mensagem)) {
      return { destino: DESTINO.IGNORAR, texto: mensagem, motivo: 'IA_DISSE_OUTRO' };
    }
    return assistenteAtiva
      ? { destino: DESTINO.CHAT, texto: mensagem, motivo: 'OUTRO_MAS_PERGUNTOU' }
      : { destino: DESTINO.IGNORAR, texto: mensagem, motivo: 'IA_DISSE_OUTRO' };
  }

  return { destino: DESTINO.LANCAMENTO, texto: mensagem, motivo: 'IA_DISSE_LANCAMENTO' };
}

module.exports = { decidirSemIA, decidirComIntencao, pareceperguntaOuPedido, DESTINO };
