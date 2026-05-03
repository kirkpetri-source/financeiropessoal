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
 * Suporta múltiplas transações por mensagem (uma por linha).
 * Retorna a quantidade de transações criadas.
 */
async function processPolledMessage(msg, userId) {
  const messageId = msg.key?.id;
  const rawContent = msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.ephemeralMessage?.message?.conversation
    || null;

  const messageTimestamp = msg.messageTimestamp;
  const groupId = msg.key?.remoteJid;

  if (!rawContent) return 0;

  // Divide por linha — suporta múltiplos lançamentos em uma mensagem
  const lines = rawContent.split('\n').map(l => l.trim()).filter(Boolean);
  const financialLines = lines.filter(looksLikeFinancialMessage);

  if (!financialLines.length) return 0;

  const txDate = messageTimestamp
    ? new Date(messageTimestamp * 1000).toISOString()
    : new Date().toISOString();

  let created = 0;

  for (let i = 0; i < financialLines.length; i++) {
    const line = financialLines[i];
    // ID único por linha para deduplicação
    const lineMessageId = financialLines.length > 1 ? `${messageId}_line${i}` : messageId;

    if (await isAlreadyProcessed(lineMessageId)) continue;

    const logRef = await db.collection('whatsappLogs').add({
      userId,
      messageId: lineMessageId,
      groupId,
      sender: 'você (polling)',
      messageType: 'TEXT',
      content: line,
      processingStatus: 'PENDING',
      rawPayload: msg,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const parsed = parseFinancialMessage(line);
    if (!parsed) {
      await logRef.update({
        processingStatus: 'ERROR',
        errorMessage: `Não foi possível interpretar: "${line}"`,
      });
      continue;
    }

    const [categoryId, paymentMethodId] = await Promise.all([
      resolveCategoryId(userId, parsed.categoryName),
      resolvePaymentMethodId(userId, parsed.paymentMethodName),
    ]);

    if (!categoryId || !paymentMethodId) {
      await logRef.update({ processingStatus: 'ERROR', errorMessage: 'Categoria ou forma de pagamento não encontrada.' });
      continue;
    }

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
    created++;
  }

  return created;
}

/**
 * Executa o polling para um usuário específico.
 * Busca mensagens fromMe no grupo e processa as novas.
 */
async function pollForUser(userId, config) {
  const results = { checked: 0, processed: 0, skipped: 0, errors: 0 };

  try {
    const messages = await fetchGroupMessages(config, config.groupId, { fromMe: true, limit: 50 });
    results.checked = messages.length;

    // Processa mensagens das últimas 24 horas — cobre o dia inteiro
    const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

    for (const msg of messages) {
      const messageId = msg.key?.id;
      const timestamp = msg.messageTimestamp || 0;

      if (timestamp && timestamp < oneDayAgo) { results.skipped++; continue; }
      if (await isAlreadyProcessed(messageId)) { results.skipped++; continue; }

      try {
        const txs = await processPolledMessage(msg, userId);
        results.processed += txs;
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
