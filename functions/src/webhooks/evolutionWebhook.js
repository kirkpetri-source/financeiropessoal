const { db } = require('../config/firebaseAdmin');
const { parseFinancialMessage, looksLikeFinancialMessage } = require('../utils/financialParser');
const { parseWithAI } = require('../services/aiParserService');
const { createLog, updateLog } = require('../services/whatsappLogService');
const { createTransaction } = require('../services/transactionService');
const { resolvePayerName } = require('../utils/resolvePayerName');

function extractMessageData(payload) {
  try {
    const data = payload.data || payload;
    const messageId = data.key?.id || null;
    const remoteJid = data.key?.remoteJid || null;
    const fromMe = data.key?.fromMe || false;
    const pushName = data.pushName || null;
    // JID do remetente — em grupos é data.key.participant, em privado é remoteJid
    const senderJid = data.key?.participant || (fromMe ? null : remoteJid) || null;
    const sender = pushName || senderJid || null;
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

    return { messageId, remoteJid, fromMe, sender, senderJid, pushName, content, messageType, instanceName };
  } catch {
    return { messageId: null, remoteJid: null, fromMe: false, sender: null, senderJid: null, pushName: null, content: null, messageType: 'TEXT', instanceName: null };
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
    const { messageId, remoteJid, fromMe, sender, senderJid, pushName, content, messageType, instanceName } = extractMessageData(req.body);

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

    // DEDUPLICAÇÃO: evita lançamento duplicado caso a mesma mensagem chegue
    // pelo webhook mais de uma vez (retry do Evolution) ou também pelo polling.
    if (messageId) {
      const dup = await db.collection('whatsappLogs')
        .where('messageId', '==', messageId).limit(1).get();
      if (!dup.empty) return;
    }

    const log = await createLog(logBase);

    // Passa lista de pagadores configurados para o parser detectar nome no final
    const configPayers = userConfig.payers || [];

    // 1) Tenta o parser por regras (rápido e grátis). 2) Se falhar, cai para a IA,
    //    que interpreta linguagem natural e pode extrair vários lançamentos.
    let parsedList = [];
    const regexParsed = parseFinancialMessage(content, configPayers);
    if (regexParsed) {
      parsedList = [regexParsed];
    } else {
      const aiList = await parseWithAI(content, configPayers);
      if (Array.isArray(aiList)) parsedList = aiList;
    }

    if (!parsedList.length) {
      await updateLog(log.id, {
        processingStatus: 'ERROR',
        errorMessage: `Não foi possível interpretar: "${content}". Ex.: "mercado 84,90 pix" ou "paguei 50 de gasolina".`,
      });
      return;
    }

    const txDate = new Date().toISOString();
    const transactionIds = [];

    for (const parsed of parsedList) {
      const [categoryId, paymentMethodId] = await Promise.all([
        resolveCategoryId(userId, parsed.categoryName),
        resolvePaymentMethodId(userId, parsed.paymentMethodName),
      ]);

      if (!categoryId || !paymentMethodId) continue;

      // Resolve paidBy: 1) nome na msg, 2) telefone configurado, 3) pushName
      const paidBy = resolvePayerName(parsed.paidBy, senderJid, pushName, configPayers);

      const transaction = await createTransaction(userId, {
        type: parsed.type,
        description: parsed.description,
        amount: parsed.amount,
        categoryId,
        paymentMethodId,
        date: txDate,
        notes: `Via WhatsApp (${origem}). Enviado por: ${sender || 'você'}`,
        origin: 'WHATSAPP',
        status: 'CONFIRMED',
        paidBy,
      });
      transactionIds.push(transaction.id);
    }

    if (!transactionIds.length) {
      await updateLog(log.id, { processingStatus: 'ERROR', errorMessage: 'Categoria ou forma de pagamento não encontrada.' });
      return;
    }

    await updateLog(log.id, { processingStatus: 'PROCESSED', transactionId: transactionIds[0] });

  } catch (err) {
    console.error('[Webhook] Erro:', err);
  }
}

module.exports = { handleEvolutionWebhook };
