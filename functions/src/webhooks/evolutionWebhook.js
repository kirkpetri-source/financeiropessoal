const { db } = require('../config/firebaseAdmin');
const { parseFinancialMessage } = require('../utils/financialParser');
const { createLog, updateLog } = require('../services/whatsappLogService');
const { createTransaction } = require('../services/transactionService');

const FINANCIAL_KEYWORDS = ['gasto', 'despesa', 'paguei', 'pago', 'gastei', 'comprei', 'compra', 'pagar', 'gastando', 'receita', 'entrada', 'recebi', 'recebido', 'receber', 'ganhei', 'ganhou', 'deposito', 'depósito'];

// Só tenta processar se a mensagem começar com palavra financeira conhecida
function looksLikeFinancialMessage(text) {
  if (!text) return false;
  const lower = text.trim().toLowerCase();
  return FINANCIAL_KEYWORDS.some((k) => lower.startsWith(k));
}

function extractMessageData(payload) {
  try {
    const data = payload.data || payload;
    const messageId = data.key?.id || null;
    const remoteJid = data.key?.remoteJid || null;
    const fromMe = data.key?.fromMe || false;
    const sender = data.pushName || data.key?.participant || null;
    const instanceName = payload.instance || null;

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
    } else if (data.message?.videoMessage) {
      messageType = 'DOCUMENT';
    } else if (data.message?.stickerMessage) {
      messageType = 'STICKER';
    }

    return { messageId, remoteJid, fromMe, sender, content, messageType, instanceName };
  } catch {
    return { messageId: null, remoteJid: null, fromMe: false, sender: null, content: null, messageType: 'TEXT', instanceName: null };
  }
}

// Busca usuário pelo grupo OU pela instância (chat privado)
async function findUserBySource(remoteJid, instanceName) {
  const isGroup = remoteJid?.endsWith('@g.us');

  if (isGroup) {
    const snap = await db.collection('whatsappConfigs')
      .where('enabled', '==', true)
      .where('groupId', '==', remoteJid)
      .limit(1).get();
    if (!snap.empty) return snap.docs[0].data();
  }

  // Chat privado: busca pela instância com allowPrivateChat ativo
  if (!isGroup && instanceName) {
    const snap = await db.collection('whatsappConfigs')
      .where('enabled', '==', true)
      .where('instanceName', '==', instanceName)
      .where('allowPrivateChat', '==', true)
      .limit(1).get();
    if (!snap.empty) return snap.docs[0].data();
  }

  return null;
}

async function resolveCategoryId(userId, categoryName) {
  const [defaultSnap, userSnap] = await Promise.all([
    db.collection('categories').where('isDefault', '==', true).where('name', '==', categoryName).limit(1).get(),
    db.collection('categories').where('userId', '==', userId).where('name', '==', categoryName).limit(1).get(),
  ]);
  if (!userSnap.empty) return userSnap.docs[0].id;
  if (!defaultSnap.empty) return defaultSnap.docs[0].id;
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

  try {
    const { messageId, remoteJid, fromMe, sender, content, messageType, instanceName } = extractMessageData(req.body);

    const userConfig = await findUserBySource(remoteJid, instanceName);

    const isPrivateChat = !remoteJid?.endsWith('@g.us');
    const origem = isPrivateChat ? 'chat privado' : 'grupo';

    const logBase = {
      rawPayload: req.body,
      messageId,
      groupId: remoteJid,
      sender: sender || (fromMe ? 'você' : 'desconhecido'),
      messageType,
      content,
      processingStatus: 'PENDING',
      userId: userConfig?.userId || null,
    };

    if (!userConfig) {
      // Não salva log para origens não reconhecidas — evita poluição
      return;
    }

    const { userId } = userConfig;

    // Mídia não-texto: salva como pendente apenas se for do grupo (no privado ignora silenciosamente)
    if (messageType === 'IMAGE' || messageType === 'AUDIO' || messageType === 'DOCUMENT') {
      if (!isPrivateChat) {
        const log = await createLog(logBase);
        await updateLog(log.id, {
          processingStatus: 'PENDING',
          errorMessage: `Processamento de ${messageType.toLowerCase()} ainda não implementado.`,
        });
      }
      return;
    }

    if (messageType === 'STICKER' || messageType !== 'TEXT' || !content) return;

    if (isCommand(content)) return;

    // PROTEÇÃO INTELIGENTE: ignora silenciosamente mensagens que não parecem financeiras
    // (links, frases do dia a dia, imagens com legenda, etc.)
    if (!looksLikeFinancialMessage(content)) return;

    const log = await createLog(logBase);

    const parsed = parseFinancialMessage(content);
    if (!parsed) {
      await updateLog(log.id, {
        processingStatus: 'ERROR',
        errorMessage: `Não foi possível interpretar: "${content}". Use: gasto [descrição] [valor] [pagamento]`,
      });
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
      notes: `Via WhatsApp (${origem}). Remetente: ${sender || 'você'}`,
      origin: 'WHATSAPP',
      status: 'CONFIRMED',
    });

    await updateLog(log.id, { processingStatus: 'PROCESSED', transactionId: transaction.id });

  } catch (err) {
    console.error('[Webhook] Erro:', err);
  }
}

module.exports = { handleEvolutionWebhook };
