const { db, admin } = require('../config/firebaseAdmin');
const { fetchGroupMessages } = require('./evolutionApiService');
const { parseFinancialMessage } = require('../utils/financialParser');
const { createTransaction } = require('./transactionService');

const FINANCIAL_KEYWORDS = ['gasto', 'despesa', 'paguei', 'gastei', 'receita', 'entrada', 'recebi', 'recebido'];

function looksLikeFinancialMessage(text) {
  if (!text) return false;
  return FINANCIAL_KEYWORDS.some((k) => text.trim().toLowerCase().startsWith(k));
}

async function isAlreadyProcessed(messageId) {
  if (!messageId) return true;
  const snap = await db.collection('whatsappLogs')
    .where('messageId', '==', messageId).limit(1).get();
  return !snap.empty;
}

async function resolveCategoryId(userId, categoryName) {
  const [d, u] = await Promise.all([
    db.collection('categories').where('isDefault', '==', true).where('name', '==', categoryName).limit(1).get(),
    db.collection('categories').where('userId', '==', userId).where('name', '==', categoryName).limit(1).get(),
  ]);
  if (!u.empty) return u.docs[0].id;
  if (!d.empty) return d.docs[0].id;
  const fallback = await db.collection('categories').where('isDefault', '==', true).where('name', '==', 'Outros').limit(1).get();
  return fallback.empty ? null : fallback.docs[0].id;
}

async function resolvePaymentMethodId(userId, methodName) {
  const name = methodName || 'Pix';
  const [d, u] = await Promise.all([
    db.collection('paymentMethods').where('isDefault', '==', true).where('name', '==', name).limit(1).get(),
    db.collection('paymentMethods').where('userId', '==', userId).where('name', '==', name).limit(1).get(),
  ]);
  if (!u.empty) return u.docs[0].id;
  if (!d.empty) return d.docs[0].id;
  const fallback = await db.collection('paymentMethods').where('isDefault', '==', true).where('name', '==', 'Outro').limit(1).get();
  return fallback.empty ? null : fallback.docs[0].id;
}

/**
 * Processa uma mensagem buscada via polling (fromMe: true).
 */
async function processPolledMessage(msg, userId) {
  const messageId = msg.key?.id;
  const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || null;
  const messageTimestamp = msg.messageTimestamp;
  const groupId = msg.key?.remoteJid;

  if (!content || !looksLikeFinancialMessage(content)) return null;

  const logRef = await db.collection('whatsappLogs').add({
    userId,
    messageId,
    groupId,
    sender: 'você (polling)',
    messageType: 'TEXT',
    content,
    processingStatus: 'PENDING',
    rawPayload: msg,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const parsed = parseFinancialMessage(content);
  if (!parsed) {
    await logRef.update({
      processingStatus: 'ERROR',
      errorMessage: `Não foi possível interpretar: "${content}"`,
    });
    return null;
  }

  const [categoryId, paymentMethodId] = await Promise.all([
    resolveCategoryId(userId, parsed.categoryName),
    resolvePaymentMethodId(userId, parsed.paymentMethodName),
  ]);

  if (!categoryId || !paymentMethodId) {
    await logRef.update({ processingStatus: 'ERROR', errorMessage: 'Categoria ou forma de pagamento não encontrada.' });
    return null;
  }

  // Usa timestamp da mensagem original se disponível
  const txDate = messageTimestamp
    ? new Date(messageTimestamp * 1000).toISOString()
    : parsed.date.toISOString();

  const transaction = await createTransaction(userId, {
    type: parsed.type,
    description: parsed.description,
    amount: parsed.amount,
    categoryId,
    paymentMethodId,
    date: txDate,
    notes: 'Via WhatsApp (polling do grupo)',
    origin: 'WHATSAPP',
    status: 'CONFIRMED',
  });

  await logRef.update({ processingStatus: 'PROCESSED', transactionId: transaction.id });
  return transaction;
}

/**
 * Executa o polling para um usuário específico.
 * Busca mensagens fromMe no grupo e processa as novas.
 */
async function pollForUser(userId, config) {
  const results = { checked: 0, processed: 0, skipped: 0, errors: 0 };

  try {
    const messages = await fetchGroupMessages(config, config.groupId, { fromMe: true, limit: 30 });
    results.checked = messages.length;

    // Filtra apenas mensagens dos últimos 10 minutos para evitar reprocessar histórico
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 10 * 60;

    for (const msg of messages) {
      const messageId = msg.key?.id;
      const timestamp = msg.messageTimestamp || 0;

      if (timestamp && timestamp < tenMinutesAgo) { results.skipped++; continue; }

      if (await isAlreadyProcessed(messageId)) { results.skipped++; continue; }

      try {
        const tx = await processPolledMessage(msg, userId);
        if (tx) results.processed++;
        else results.skipped++;
      } catch (err) {
        console.error('[Polling] Erro ao processar mensagem:', err.message);
        results.errors++;
      }
    }

    // Atualiza timestamp do último polling
    await db.collection('whatsappConfigs').doc(userId).update({
      lastPolledAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  } catch (err) {
    console.error(`[Polling] Erro para userId ${userId}:`, err.message);
    results.errors++;
  }

  return results;
}

/**
 * Executa polling para todos os usuários com integração ativa.
 */
async function pollAllUsers() {
  const snap = await db.collection('whatsappConfigs')
    .where('enabled', '==', true).get();

  const results = [];
  for (const doc of snap.docs) {
    const config = doc.data();
    if (!config.groupId || !config.evolutionApiUrl || !config.apiKey) continue;
    const result = await pollForUser(doc.id, config);
    results.push({ userId: doc.id, ...result });
  }

  console.log('[Polling] Resultado:', JSON.stringify(results));
  return results;
}

module.exports = { pollAllUsers, pollForUser };
