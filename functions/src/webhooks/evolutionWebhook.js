const { db } = require('../config/firebaseAdmin');
const { parseFinancialMessage } = require('../utils/financialParser');
const { createLog, updateLog } = require('../services/whatsappLogService');
const { createTransaction } = require('../services/transactionService');

function extractMessageData(payload) {
  try {
    const data = payload.data || payload;
    const messageId = data.key?.id || null;
    const groupId = data.key?.remoteJid || null;
    const sender = data.pushName || data.key?.participant || null;

    let content = null;
    let messageType = 'TEXT';

    if (data.message?.conversation) {
      content = data.message.conversation;
    } else if (data.message?.extendedTextMessage?.text) {
      content = data.message.extendedTextMessage.text;
    } else if (data.message?.imageMessage) {
      content = data.message.imageMessage.caption || null;
      messageType = 'IMAGE';
    } else if (data.message?.audioMessage) {
      messageType = 'AUDIO';
    } else if (data.message?.documentMessage) {
      messageType = 'DOCUMENT';
    } else if (data.message?.stickerMessage) {
      messageType = 'STICKER';
    }

    return { messageId, groupId, sender, content, messageType };
  } catch {
    return { messageId: null, groupId: null, sender: null, content: null, messageType: 'TEXT' };
  }
}

async function findUserByGroup(groupId) {
  const snap = await db.collection('whatsappConfigs')
    .where('enabled', '==', true)
    .where('groupId', '==', groupId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data();
}

async function resolveCategoryId(userId, categoryName) {
  const [defaultSnap, userSnap] = await Promise.all([
    db.collection('categories').where('isDefault', '==', true).where('name', '==', categoryName).limit(1).get(),
    db.collection('categories').where('userId', '==', userId).where('name', '==', categoryName).limit(1).get(),
  ]);

  if (!userSnap.empty) return userSnap.docs[0].id;
  if (!defaultSnap.empty) return defaultSnap.docs[0].id;

  // Fallback para "Outros"
  const fallback = await db.collection('categories').where('isDefault', '==', true).where('name', '==', 'Outros').limit(1).get();
  return fallback.empty ? null : fallback.docs[0].id;
}

async function resolvePaymentMethodId(userId, methodName) {
  const name = methodName || 'Pix';
  const [defaultSnap, userSnap] = await Promise.all([
    db.collection('paymentMethods').where('isDefault', '==', true).where('name', '==', name).limit(1).get(),
    db.collection('paymentMethods').where('userId', '==', userId).where('name', '==', name).limit(1).get(),
  ]);

  if (!userSnap.empty) return userSnap.docs[0].id;
  if (!defaultSnap.empty) return defaultSnap.docs[0].id;

  const fallback = await db.collection('paymentMethods').where('isDefault', '==', true).where('name', '==', 'Outro').limit(1).get();
  return fallback.empty ? null : fallback.docs[0].id;
}

function isCommand(message) {
  const COMMANDS = ['resumo mes', 'ultimos', 'apagar ultimo', 'categorias', 'ajuda', '/resumo', '/ultimos', '/ajuda'];
  return COMMANDS.some((c) => message.toLowerCase().startsWith(c));
}

async function handleEvolutionWebhook(req, res) {
  res.status(200).json({ received: true });

  // Diagnóstico: salva todo payload bruto para depuração
  try {
    await db.collection('webhookDiagnostics').add({
      payload: req.body,
      event: req.body?.event || req.body?.data?.event || 'unknown',
      receivedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[Diag] Erro ao salvar diagnóstico:', e.message);
  }

  try {
    const { messageId, groupId, sender, content, messageType } = extractMessageData(req.body);
    const userConfig = await findUserByGroup(groupId);

    const logBase = { rawPayload: req.body, messageId, groupId, sender, messageType, content, processingStatus: 'PENDING', userId: userConfig?.userId || null };

    if (!userConfig) {
      await createLog({ ...logBase, processingStatus: 'IGNORED' });
      return;
    }

    const { userId } = userConfig;
    const log = await createLog(logBase);

    if (messageType === 'IMAGE') {
      await updateLog(log.id, { processingStatus: 'PENDING', errorMessage: 'Processamento de imagens ainda não implementado.' });
      return;
    }
    if (messageType === 'AUDIO') {
      await updateLog(log.id, { processingStatus: 'PENDING', errorMessage: 'Transcrição de áudio ainda não implementada.' });
      return;
    }
    if (messageType !== 'TEXT' || !content) {
      await updateLog(log.id, { processingStatus: 'IGNORED' });
      return;
    }
    if (isCommand(content)) {
      await updateLog(log.id, { processingStatus: 'IGNORED' });
      return;
    }

    const parsed = parseFinancialMessage(content);
    if (!parsed) {
      await updateLog(log.id, { processingStatus: 'ERROR', errorMessage: 'Não foi possível interpretar a mensagem como lançamento financeiro.' });
      return;
    }

    const [categoryId, paymentMethodId] = await Promise.all([
      resolveCategoryId(userId, parsed.categoryName),
      resolvePaymentMethodId(userId, parsed.paymentMethodName),
    ]);

    if (!categoryId || !paymentMethodId) {
      await updateLog(log.id, { processingStatus: 'ERROR', errorMessage: 'Categoria ou forma de pagamento não encontrada.' });
      return;
    }

    const transaction = await createTransaction(userId, {
      type: parsed.type,
      description: parsed.description,
      amount: parsed.amount,
      categoryId,
      paymentMethodId,
      date: parsed.date.toISOString(),
      notes: `Via WhatsApp. Remetente: ${sender || 'desconhecido'}`,
      origin: 'WHATSAPP',
      status: 'CONFIRMED',
    });

    await updateLog(log.id, { processingStatus: 'PROCESSED', transactionId: transaction.id });

  } catch (err) {
    console.error('[Webhook] Erro:', err);
  }
}

module.exports = { handleEvolutionWebhook };
