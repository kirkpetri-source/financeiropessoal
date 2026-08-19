const { db } = require('../config/firebaseAdmin');
const { escopoDe } = require('../data/escopo');
const { parseFinancialMessage, looksLikeFinancialMessage } = require('../utils/financialParser');
const { detectarParcelamento, montarParcelas } = require('../utils/parcelamento');
const { parseWithAI, resolverSubcategoria } = require('./aiParserService');
const { verificarLimiteDeIA } = require('./limiteIAService');
const { permitirMensagem, limite: limiteMensagens } = require('./limiteMensagensService');
const { createTransaction, updateTransaction } = require('./transactionService');
const { listSubcategories } = require('./subcategoryService');
const householdService = require('./householdService');
const { situacaoDaAssinatura, mensagemDaSituacao } = require('../assinatura/estado');
const { telefoneDe, montarPerguntaSubcategoria, resolverRespostaConfirmacao } = require('../utils/subcategoriaConfirmacao');
const { mensagemLimiteIA } = require('../utils/mensagensDeLimite');



/**
 * Transforma uma mensagem de texto em lançamento(s), para a família certa.
 *
 * Ficava duplicado entre o webhook e o polling — duas cópias que precisavam ser
 * corrigidas juntas e que já tinham divergido (a data do lançamento, por
 * exemplo: o webhook usava a hora do processamento, o polling a hora da
 * mensagem). Agora existe um caminho só.
 */

/**
 * Localiza a família dona de um grupo do WhatsApp (ou da instância, no chat privado).
 *
 * A config sai por `configEfetiva`, e não crua do documento: a família
 * provisionada pelo sistema não guarda URL nem API key, e sem isso a resposta
 * de confirmação falharia em silêncio no catch do respostaWhatsapp.
 */
async function acharHouseholdPorOrigem(remoteJid, instanceName) {
  const { configEfetiva } = require('../config/evolutionServidor');
  const ehGrupo = remoteJid?.endsWith('@g.us');

  if (ehGrupo && remoteJid) {
    const snap = await db.collection('whatsappConfigs')
      .where('enabled', '==', true)
      .where('groupId', '==', remoteJid)
      .limit(1).get();
    if (!snap.empty) return { householdId: snap.docs[0].id, config: configEfetiva(snap.docs[0].data()) };
  }

  if (!ehGrupo && instanceName) {
    const snap = await db.collection('whatsappConfigs')
      .where('enabled', '==', true)
      .where('instanceName', '==', instanceName)
      .where('allowPrivateChat', '==', true)
      .limit(1).get();

    if (!snap.empty) {
      const dados = snap.docs[0].data();

      // TRAVA DO MODO INDIVIDUAL.
      //
      // Neste modo o robô roda no número do próprio cliente, então TODA conversa
      // privada dele chega aqui. Sem esta verificação, um amigo mandando
      // "te devo 50" viraria despesa no financeiro da família.
      //
      // Só a auto-conversa vale — o "Mensagens para mim mesmo" do WhatsApp, onde
      // o destinatário é o próprio número. É lá que o cliente lança.
      if (dados.ownerJid) {
        const proprio = String(dados.ownerJid).replace(/@.*/, '').replace(/\D/g, '');
        const destino = String(remoteJid || '').replace(/@.*/, '').replace(/\D/g, '');
        if (!proprio || !destino || proprio !== destino) return null;
      }

      return { householdId: snap.docs[0].id, config: configEfetiva(dados) };
    }
  }

  return null;
}

async function resolverCategoriaId(dados, nomeCategoria) {
  const [padrao, daFamilia] = await Promise.all([
    dados.consultarPadroes('categories').where('name', '==', nomeCategoria).limit(1).get(),
    dados.consultar('categories').where('name', '==', nomeCategoria).limit(1).get(),
  ]);
  if (!daFamilia.empty) return daFamilia.docs[0].id;
  if (!padrao.empty) return padrao.docs[0].id;

  const reserva = await dados.consultarPadroes('categories').where('name', '==', 'Outros').limit(1).get();
  return reserva.empty ? null : reserva.docs[0].id;
}

async function resolverFormaPagamentoId(dados, nomeForma) {
  const nome = nomeForma || 'Pix';
  const [padrao, daFamilia] = await Promise.all([
    dados.consultarPadroes('paymentMethods').where('name', '==', nome).limit(1).get(),
    dados.consultar('paymentMethods').where('name', '==', nome).limit(1).get(),
  ]);
  if (!daFamilia.empty) return daFamilia.docs[0].id;
  if (!padrao.empty) return padrao.docs[0].id;

  const reserva = await dados.consultarPadroes('paymentMethods').where('name', '==', 'Outro').limit(1).get();
  return reserva.empty ? null : reserva.docs[0].id;
}

/**
 * Decide quem pagou:
 *   1. nome escrito na mensagem      — o mais explícito ganha
 *   2. telefone do remetente         — identificação automática
 *   3. nome do perfil, SÓ se bater com algum membro cadastrado
 *
 * O passo 3 antes aceitava o pushName cru. Como o perfil costuma ter nome
 * completo e enfeite ("Kirk Douglas - Lion Tech"), isso criava pagadores
 * fantasma que apareciam separados nos gráficos de gastos por pessoa.
 */
async function resolverPagador(householdId, nomeNaMensagem, senderJid, pushName) {
  if (nomeNaMensagem) return nomeNaMensagem;

  const porTelefone = await householdService.acharMembroPorTelefone(
    householdId,
    senderJid ? senderJid.replace(/@.*/, '') : null
  );
  if (porTelefone) return porTelefone.name;

  const membros = await householdService.listarMembros(householdId);

  if (pushName) {
    const perfil = String(pushName).toLowerCase();
    const casou = membros.find((m) => m.name && perfil.includes(String(m.name).toLowerCase()));
    if (casou) return casou.name;
  }

  // Família de uma pessoa só: o gasto é dela, ponto. Sem isso, quem usa
  // sozinho via chat privado ficava com TODOS os lançamentos sem dono — que foi
  // exatamente o que aconteceu nos 14 primeiros lançamentos de teste.
  if (membros.length === 1 && membros[0].name) return membros[0].name;

  return null;
}

/**
 * Assinatura vencida bloqueia o lançamento também pelo WhatsApp — senão o
 * canal principal do produto vira uma porta dos fundos para usar de graça.
 * Devolve a mensagem a mandar no grupo, ou null quando está tudo em dia.
 */
async function bloqueioPorAssinatura(householdId) {
  const doc = await db.collection('households').doc(householdId).get();
  if (!doc.exists) return 'Família não encontrada.';

  const situacao = situacaoDaAssinatura(doc.data().subscription, new Date());
  return situacao.podeLancar ? null : mensagemDaSituacao(situacao);
}

/**
 * Telefone de quem vai responder a pergunta de subcategoria.
 *
 * No modo individual (mensagem pra si mesmo), o WhatsApp reporta a própria
 * mensagem como fromMe:true — extrairMensagem() então NUNCA preenche
 * senderJid nesse modo (mesma trava documentada em acharHouseholdPorOrigem:
 * "o robô roda no número do próprio cliente"). Sem este fallback, a pergunta
 * de subcategoria caía sempre em "sem remetente identificável" e sumia em
 * silêncio — achado testando de verdade pelo WhatsApp (modo individual,
 * conta de teste liontech.sup@gmail.com, 11/08/2026): confirmava a categoria
 * mas nunca perguntava a subcategoria ambígua. Em modo grupo isso nunca
 * entra em jogo — o `participant` sempre vem preenchido.
 */
async function telefoneEfetivo(senderJid, householdId) {
  const direto = telefoneDe(senderJid);
  if (direto) return direto;

  const doc = await db.collection('whatsappConfigs').doc(householdId).get();
  return telefoneDe(doc.data()?.ownerJid);
}

/**
 * Tenta descobrir a subcategoria de um lançamento recém-criado, só quando a
 * categoria dele já tem alguma cadastrada — família sem subcategoria nunca
 * paga o custo de mais uma chamada de IA.
 *
 * Confiante o bastante: aplica direto, sem gerar pergunta nenhuma (caminho
 * feliz, silencioso). Incerto: cria uma pendência e devolve o texto da
 * pergunta pro chamador mandar no WhatsApp — nunca adivinha.
 *
 * Estourar o teto diário de IA aqui não bloqueia nada: o lançamento já foi
 * criado antes desta função ser chamada, só fica sem subcategoria.
 */
async function resolverOuPerguntarSubcategoria({ dados, householdId, transacao, categoryId, categoryName, senderJid }) {
  const subcategorias = await listSubcategories(dados, categoryId);
  if (!subcategorias.length) return null;

  const permitido = await verificarLimiteDeIA(householdId);
  if (!permitido) return null;

  const nomeEscolhido = await resolverSubcategoria({
    descricao: transacao.description,
    categoriaNome: categoryName,
    opcoes: subcategorias.map((s) => s.name),
  });

  if (nomeEscolhido) {
    const escolhida = subcategorias.find((s) => s.name === nomeEscolhido);
    if (escolhida) await updateTransaction(dados, transacao.id, { subcategoryId: escolhida.id });
    return null;
  }

  const telefone = await telefoneEfetivo(senderJid, householdId);
  if (!telefone) return null; // sem remetente identificável não tem pra quem perguntar

  await dados.criar('pendingSubcategoryConfirmations', {
    phone: telefone,
    transactionId: transacao.id,
    categoryId,
    categoryName,
    opcoes: subcategorias.map((s) => ({ id: s.id, name: s.name })),
  });

  return montarPerguntaSubcategoria(categoryName, subcategorias);
}

const EXPIRA_CONFIRMACAO_MS = 15 * 60 * 1000;

/**
 * Segunda metade do fluxo de pergunta: quando chega uma mensagem nova, olha
 * primeiro se há uma pergunta de subcategoria esperando resposta desse
 * remetente antes de tratar a mensagem como comando ou lançamento novo.
 *
 * Descarta a pendência sempre — bateu ou não bateu — porque é single-shot:
 * uma mensagem que não é a resposta esperada precisa continuar livre para
 * virar um lançamento novo, não ficar presa tentando casar contra uma
 * pergunta velha pra sempre.
 */
async function tentarResolverConfirmacaoPendente({ householdId, senderJid, texto }) {
  const telefone = await telefoneEfetivo(senderJid, householdId);
  if (!telefone) return { tratado: false };

  const dados = escopoDe(householdId);
  const snap = await dados.consultar('pendingSubcategoryConfirmations')
    .where('phone', '==', telefone).limit(1).get();
  if (snap.empty) return { tratado: false };

  const pendencia = { id: snap.docs[0].id, ...snap.docs[0].data() };

  const criadoEm = pendencia.createdAt?.toDate?.();
  const expirada = !criadoEm || (Date.now() - criadoEm.getTime() > EXPIRA_CONFIRMACAO_MS);
  if (expirada) {
    await dados.remover('pendingSubcategoryConfirmations', pendencia.id);
    return { tratado: false };
  }

  const resultado = resolverRespostaConfirmacao(pendencia.opcoes, texto);

  await dados.remover('pendingSubcategoryConfirmations', pendencia.id);
  if (!resultado) return { tratado: false };

  await updateTransaction(dados, pendencia.transactionId, { subcategoryId: resultado.subcategoryId });
  return { tratado: true, resposta: resultado.resposta };
}

/**
 * Interpreta o texto e cria os lançamentos.
 * @returns {Promise<{transacoes: string[], erro: string|null}>}
 */
const ORIGEM_LABEL = { AUDIO: 'áudio transcrito', IMAGE: 'foto de cupom' };

async function lancarPorTexto({ householdId, texto, senderJid, pushName, dataDaMensagem, origem, origin = 'WHATSAPP' }) {
  if (!permitirMensagem(householdId)) {
    console.warn(`[LimiteMensagens] Família ${householdId} passou de ${limiteMensagens} mensagens/min — descartada.`);
    return { transacoes: [], criadas: [], erro: 'Muitas mensagens em pouco tempo.', silencioso: true };
  }

  const bloqueio = await bloqueioPorAssinatura(householdId);
  if (bloqueio) return { transacoes: [], criadas: [], erro: bloqueio, bloqueado: true };

  const dados = escopoDe(householdId);

  const membros = await householdService.listarMembros(householdId);
  const nomesDosMembros = membros.map((m) => m.name).filter(Boolean);

  // Parcelamento sai do texto ANTES de interpretar: senao o parser le o "10x"
  // como se fosse o valor da compra.
  const parcelado = detectarParcelamento(texto);
  const textoParaParser = parcelado ? parcelado.textoLimpo : texto;

  // 1) regras (rápido e grátis)  2) IA, só se as regras não derem conta
  let interpretados = [];
  let intencaoDaIA = null;
  const porRegra = parseFinancialMessage(textoParaParser, nomesDosMembros);
  if (porRegra) {
    interpretados = [porRegra];
  } else {
    const permitido = await verificarLimiteDeIA(householdId);
    if (!permitido) {
      return { transacoes: [], criadas: [], erro: mensagemLimiteIA() };
    }

    const porIA = await parseWithAI(textoParaParser, nomesDosMembros);
    if (Array.isArray(porIA)) {
      interpretados = porIA;
      // A IA classificou junto o que a mensagem era. Sobe no retorno para o
      // webhook poder mandar uma PERGUNTA para a assistente em vez de
      // responder "não entendi" — sem gastar uma segunda chamada de IA.
      intencaoDaIA = porIA.intencao || null;
    }
  }

  if (!interpretados.length) {
    return {
      transacoes: [],
      intencaoDaIA,
      // O erro precisa ensinar a regra, não só reclamar: começar dizendo se
      // gastou ou recebeu é o que faz a mensagem ser entendida.
      erro: `Não entendi "${texto}".\n\n`
        + 'Comece dizendo se gastou ou recebeu:\n'
        + '• gastei 84,90 no mercado\n'
        + '• paguei 50 de gasolina no pix\n'
        + '• recebi 2500 de salário',
    };
  }

  const ids = [];
  // As transações completas (com categoria já resolvida) sobem junto: a
  // confirmação no WhatsApp precisa do nome da categoria, não só do ID.
  const criadas = [];
  // Só a primeira pergunta do lote sai — mandar uma por lançamento numa
  // mensagem com vários gastos seria ruído, e o usuário só consegue
  // responder uma pendência de cada vez (ver tentarResolverConfirmacaoPendente).
  let perguntaSubcategoria = null;

  for (const item of interpretados) {
    const [categoryId, paymentMethodId] = await Promise.all([
      resolverCategoriaId(dados, item.categoryName),
      resolverFormaPagamentoId(dados, item.paymentMethodName),
    ]);
    if (!categoryId || !paymentMethodId) continue;

    const paidBy = await resolverPagador(householdId, item.paidBy, senderJid, pushName);

    const comum = {
      type: item.type,
      categoryId,
      paymentMethodId,
      notes: origin === 'WHATSAPP' ? `Via WhatsApp (${origem}).` : `Via WhatsApp (${origem}), ${ORIGEM_LABEL[origin] || origin}.`,
      origin,
      status: 'CONFIRMED',
      paidBy,
    };

    // Compra parcelada vira N lançamentos, um por mês. Só faz sentido para
    // despesa: "recebi 300 em 3x" é raro e ambíguo demais para adivinhar.
    if (parcelado && item.type === 'EXPENSE') {
      const parcelas = montarParcelas({
        descricao: item.description,
        valorTotal: item.amount,
        parcelas: parcelado.parcelas,
        dataDaCompra: dataDaMensagem,
      });

      for (const p of parcelas) {
        const transacao = await createTransaction(dados, {
          ...comum,
          description: p.description,
          amount: p.amount,
          date: p.date,
          parcela: p.parcela,
          totalParcelas: p.totalParcelas,
          grupoParcelamento: p.grupoParcelamento,
          valorTotalParcelamento: p.valorTotal,
        });
        ids.push(transacao.id);
        // Só a primeira parcela entra na confirmação — as outras são
        // consequência dela, e listar dez linhas no grupo seria ruído.
        if (p.parcela === 1) criadas.push({ ...transacao, _parcelamento: parcelado.parcelas });
      }
      continue;
    }

    const transacao = await createTransaction(dados, {
      ...comum,
      description: item.description,
      amount: item.amount,
      // Sempre a hora da MENSAGEM, nunca a do processamento. O webhook usava a
      // hora do processamento e um gasto enviado 23h58 podia cair no dia — e no
      // mês — errado, dependendo de por onde a mensagem entrasse.
      date: dataDaMensagem,
    });
    ids.push(transacao.id);
    criadas.push(transacao);

    if (!perguntaSubcategoria) {
      perguntaSubcategoria = await resolverOuPerguntarSubcategoria({
        dados, householdId, transacao, categoryId, categoryName: item.categoryName, senderJid,
      });
    }
  }

  if (!ids.length) {
    return { transacoes: [], criadas: [], erro: 'Categoria ou forma de pagamento não encontrada.' };
  }

  return { transacoes: ids, criadas, erro: null, perguntaSubcategoria };
}

/**
 * Áudio e foto de cupom passam pela IA multimodal (midiaParserService) para
 * virar uma frase em linguagem natural, e daí em diante seguem o MESMO
 * caminho do texto digitado — mesma resolução de categoria, forma de
 * pagamento e pagador, e mesmo bloqueio por assinatura vencida.
 */
async function lancarPorAudio({ householdId, base64, mimeType, senderJid, pushName, dataDaMensagem, origem }) {
  if (!permitirMensagem(householdId)) {
    console.warn(`[LimiteMensagens] Família ${householdId} passou de ${limiteMensagens} mensagens/min — descartada.`);
    return { transacoes: [], criadas: [], erro: 'Muitas mensagens em pouco tempo.', silencioso: true };
  }

  const bloqueio = await bloqueioPorAssinatura(householdId);
  if (bloqueio) return { transacoes: [], criadas: [], erro: bloqueio, bloqueado: true };

  const permitido = await verificarLimiteDeIA(householdId);
  if (!permitido) return { transacoes: [], criadas: [], erro: mensagemLimiteIA() };

  const { transcreverAudio } = require('./midiaParserService');
  const { texto, erro } = await transcreverAudio(base64, mimeType);
  if (erro) return { transacoes: [], criadas: [], erro };

  return lancarPorTexto({ householdId, texto, senderJid, pushName, dataDaMensagem, origem, origin: 'AUDIO' });
}

async function lancarPorCupom({ householdId, base64, mimeType, senderJid, pushName, dataDaMensagem, origem }) {
  if (!permitirMensagem(householdId)) {
    console.warn(`[LimiteMensagens] Família ${householdId} passou de ${limiteMensagens} mensagens/min — descartada.`);
    return { transacoes: [], criadas: [], erro: 'Muitas mensagens em pouco tempo.', silencioso: true };
  }

  const bloqueio = await bloqueioPorAssinatura(householdId);
  if (bloqueio) return { transacoes: [], criadas: [], erro: bloqueio, bloqueado: true };

  const permitido = await verificarLimiteDeIA(householdId);
  if (!permitido) return { transacoes: [], criadas: [], erro: mensagemLimiteIA() };

  const { interpretarCupom } = require('./midiaParserService');
  const { texto, erro } = await interpretarCupom(base64, mimeType);
  if (erro) return { transacoes: [], criadas: [], erro };

  return lancarPorTexto({ householdId, texto, senderJid, pushName, dataDaMensagem, origem, origin: 'IMAGE' });
}

/** Já processamos essa mensagem? Evita lançamento duplicado (webhook + polling). */
async function jaProcessada(messageId) {
  if (!messageId) return true;
  const snap = await db.collection('whatsappLogs')
    .where('messageId', '==', messageId).limit(1).get();
  return !snap.empty;
}

module.exports = {
  acharHouseholdPorOrigem,
  bloqueioPorAssinatura,
  lancarPorTexto,
  lancarPorAudio,
  lancarPorCupom,
  jaProcessada,
  resolverPagador,
  looksLikeFinancialMessage,
  tentarResolverConfirmacaoPendente,
  telefoneEfetivo,
};
