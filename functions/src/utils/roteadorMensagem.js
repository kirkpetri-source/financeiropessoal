const { reconhecerChamado } = require('./nomeDaAssistente');
const { ehConversaFiada, normalizarParaComparar } = require('./conversaFiada');

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

// A lista de conversa fiada mora em `conversaFiada.js`: a oferta de criar
// subcategoria precisa exatamente da mesma definição, e duas cópias
// divergiriam com o tempo.

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
  const limpo = normalizarParaComparar(texto);

  if (!limpo) return false;

  // Emoji ou pontuação solta não é pergunta.
  if (!/\p{L}|\d/u.test(limpo)) return false;

  return !ehConversaFiada(limpo);
}

/**
 * A pessoa está pedindo para CADASTRAR uma conta fixa?
 *
 * Exige DOIS sinais juntos — um verbo de cadastro e um termo de recorrência —
 * e essa combinação é o que separa os dois casos que vivem na mesma frase:
 *
 *   "cadastra minha conta fixa de água, 90 reais"  -> conta fixa
 *   "paguei a mensalidade da academia"             -> lançamento
 *
 * Sem isso, o pedido caía no parser de lançamento, que vê "90 reais" e cria
 * uma despesa avulsa — a conta fixa nunca nascia e ainda aparecia um gasto
 * fantasma. Achado testando o webhook em 20/08/2026: com o nome da assistente
 * na frente funcionava, sem o nome virava lançamento.
 *
 * Fica DEPOIS da regra de lançamento na ordem de decisão, então nada do fluxo
 * que já funcionava muda de caminho.
 */
const VERBO_DE_CADASTRO = [
  'cadastr', 'adicion', 'registra como', 'criar', 'cria uma', 'cria a',
  'inclui', 'incluir', 'coloca como', 'salva como', 'quero cadastrar',
  'anota como', 'poe como', 'poe na aba', 'na aba de',
];

const TERMO_DE_RECORRENCIA = [
  'conta fixa', 'contas fixas', 'despesa fixa', 'despesas fixas',
  'receita fixa', 'gasto fixo', 'gastos fixos', 'recorrente', 'recorrentes',
  'todo mes', 'todos os meses', 'mensalmente', 'mensalidade fixa',
];

function pedeCadastroDeContaFixa(texto) {
  const limpo = String(texto || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  const temVerbo = VERBO_DE_CADASTRO.some((v) => limpo.includes(v));
  const temRecorrencia = TERMO_DE_RECORRENCIA.some((t) => limpo.includes(t));

  return temVerbo && temRecorrencia;
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
 * @param {boolean} [p.aguardandoResposta] a assistente fez uma pergunta a esta
 *   pessoa e ainda espera a resposta (ver regra 5 abaixo). Também é opcional:
 *   quem não informa mantém o comportamento anterior, inteiro.
 * @returns {{destino: string|null, texto: string, motivo: string}}
 */
function decidirSemIA({
  texto, nomeDaAssistente, ehComando, casouRegra, aguardandoResposta = false, assistenteAtiva = true,
}) {
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

  // 4. Pedido de cadastro de conta fixa. Vem DEPOIS da regra de lançamento
  //    para não mudar nada do que já funcionava, e antes do indefinido porque
  //    o parser de lançamento levaria "90 reais" para uma despesa avulsa.
  if (assistenteAtiva && pedeCadastroDeContaFixa(mensagem)) {
    return { destino: DESTINO.CHAT, texto: mensagem, motivo: 'CADASTRO_DE_CONTA_FIXA' };
  }

  // 5. A assistente PERGUNTOU algo e está esperando esta resposta.
  //
  //    "cadastra minha internet como conta fixa" entra pela regra 4; a Nina
  //    responde pedindo o valor e o dia; e a mensagem seguinte — "139,90 dia
  //    10" — não casa com nada aqui e ia direto para o parser, que via um
  //    valor e criava uma despesa em Outros. A conta fixa nunca era cadastrada
  //    e ainda sobrava um lançamento fantasma (teste ao vivo de 20/08/2026).
  //
  //    Vem DEPOIS da regra 3 de propósito: com uma pergunta no ar, "gastei 45
  //    no mercado" continua sendo lançamento. Quem chama é que consulta o
  //    estado — e só quando o parser por regra não entendeu a mensagem.
  if (assistenteAtiva && aguardandoResposta) {
    return { destino: DESTINO.CHAT, texto: mensagem, motivo: 'RESPOSTA_A_PERGUNTA_DA_ASSISTENTE' };
  }

  // 5. Precisa da IA para saber o que é. Quem chama decide se vale o custo.
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

module.exports = { decidirSemIA, decidirComIntencao, pareceperguntaOuPedido, pedeCadastroDeContaFixa, DESTINO };
