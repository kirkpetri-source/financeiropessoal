const { db } = require('../config/firebaseAdmin');
const { escopoDe } = require('../data/escopo');
const { parseFinancialMessage, looksLikeFinancialMessage } = require('../utils/financialParser');
const { parseWithAI } = require('./aiParserService');
const { createTransaction } = require('./transactionService');
const householdService = require('./householdService');

/**
 * Transforma uma mensagem de texto em lançamento(s), para a família certa.
 *
 * Ficava duplicado entre o webhook e o polling — duas cópias que precisavam ser
 * corrigidas juntas e que já tinham divergido (a data do lançamento, por
 * exemplo: o webhook usava a hora do processamento, o polling a hora da
 * mensagem). Agora existe um caminho só.
 */

/** Localiza a família dona de um grupo do WhatsApp (ou da instância, no chat privado). */
async function acharHouseholdPorOrigem(remoteJid, instanceName) {
  const ehGrupo = remoteJid?.endsWith('@g.us');

  if (ehGrupo && remoteJid) {
    const snap = await db.collection('whatsappConfigs')
      .where('enabled', '==', true)
      .where('groupId', '==', remoteJid)
      .limit(1).get();
    if (!snap.empty) return { householdId: snap.docs[0].id, config: snap.docs[0].data() };
  }

  if (!ehGrupo && instanceName) {
    const snap = await db.collection('whatsappConfigs')
      .where('enabled', '==', true)
      .where('instanceName', '==', instanceName)
      .where('allowPrivateChat', '==', true)
      .limit(1).get();
    if (!snap.empty) return { householdId: snap.docs[0].id, config: snap.docs[0].data() };
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

  if (pushName) {
    const membros = await householdService.listarMembros(householdId);
    const perfil = String(pushName).toLowerCase();
    const casou = membros.find((m) => m.name && perfil.includes(String(m.name).toLowerCase()));
    if (casou) return casou.name;
  }

  return null;
}

/**
 * Interpreta o texto e cria os lançamentos.
 * @returns {Promise<{transacoes: string[], erro: string|null}>}
 */
async function lancarPorTexto({ householdId, texto, senderJid, pushName, dataDaMensagem, origem }) {
  const dados = escopoDe(householdId);

  const membros = await householdService.listarMembros(householdId);
  const nomesDosMembros = membros.map((m) => m.name).filter(Boolean);

  // 1) regras (rápido e grátis)  2) IA, só se as regras não derem conta
  let interpretados = [];
  const porRegra = parseFinancialMessage(texto, nomesDosMembros);
  if (porRegra) {
    interpretados = [porRegra];
  } else {
    const porIA = await parseWithAI(texto, nomesDosMembros);
    if (Array.isArray(porIA)) interpretados = porIA;
  }

  if (!interpretados.length) {
    return {
      transacoes: [],
      erro: `Não foi possível interpretar: "${texto}". Ex.: "mercado 84,90 pix" ou "paguei 50 de gasolina".`,
    };
  }

  const ids = [];
  for (const item of interpretados) {
    const [categoryId, paymentMethodId] = await Promise.all([
      resolverCategoriaId(dados, item.categoryName),
      resolverFormaPagamentoId(dados, item.paymentMethodName),
    ]);
    if (!categoryId || !paymentMethodId) continue;

    const paidBy = await resolverPagador(householdId, item.paidBy, senderJid, pushName);

    const transacao = await createTransaction(dados, {
      type: item.type,
      description: item.description,
      amount: item.amount,
      categoryId,
      paymentMethodId,
      // Sempre a hora da MENSAGEM, nunca a do processamento. O webhook usava a
      // hora do processamento e um gasto enviado 23h58 podia cair no dia — e no
      // mês — errado, dependendo de por onde a mensagem entrasse.
      date: dataDaMensagem,
      notes: `Via WhatsApp (${origem}).`,
      origin: 'WHATSAPP',
      status: 'CONFIRMED',
      paidBy,
    });
    ids.push(transacao.id);
  }

  if (!ids.length) {
    return { transacoes: [], erro: 'Categoria ou forma de pagamento não encontrada.' };
  }

  return { transacoes: ids, erro: null };
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
  lancarPorTexto,
  jaProcessada,
  resolverPagador,
  looksLikeFinancialMessage,
};
