const { db, admin } = require('../config/firebaseAdmin');
const { fetchGroupMessages, fetchOwnJid } = require('./evolutionApiService');
const { parseFinancialMessage } = require('../utils/financialParser');
const { createTransaction } = require('./transactionService');
const { resolvePayerName } = require('../utils/resolvePayerName');

// Cache simples de payers por userId para evitar múltiplas consultas por mensagem
const _payersCache = {};
async function getPayersForUser(userId) {
  if (_payersCache[userId]) return _payersCache[userId];
  const doc = await db.collection('whatsappConfigs').doc(userId).get();
  const payers = doc.exists ? (doc.data().payers || []) : [];
  _payersCache[userId] = payers;
  setTimeout(() => { delete _payersCache[userId]; }, 5 * 60 * 1000); // cache 5min
  return payers;
}

const FINANCIAL_KEYWORDS = ['gasto', 'despesa', 'paguei', 'pago', 'gastei', 'comprei', 'compra', 'pagar', 'gastando', 'receita', 'entrada', 'recebi', 'recebido', 'receber', 'ganhei', 'ganhou', 'deposito', 'depósito'];

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

  // JID do remetente para identificação por telefone
  const senderJid = msg.key?.participant || msg.key?.remoteJid || null;
  // Usa o nome real do remetente se disponível, senão busca o perfil do usuário
  const senderName = msg.pushName || msg.verifiedBizName || null;
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
      sender: senderName || 'Você',
      messageType: 'TEXT',
      content: line,
      processingStatus: 'PENDING',
      rawPayload: msg,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const payers = userId ? await getPayersForUser(userId) : [];
    const parsed = parseFinancialMessage(line, payers);
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

    // Resolve paidBy: 1) nome no final da msg, 2) telefone configurado, 3) pushName
    const paidBy = resolvePayerName(parsed.paidBy, senderJid, senderName, payers);

    const transaction = await createTransaction(userId, {
      type: parsed.type,
      description: parsed.description,
      amount: parsed.amount,
      categoryId,
      paymentMethodId,
      date: txDate,
      notes: `Via WhatsApp. Enviado por: ${senderName || 'Você'}`,
      origin: 'WHATSAPP',
      status: 'CONFIRMED',
      paidBy,
    });

    await logRef.update({ processingStatus: 'PROCESSED', transactionId: transaction.id });
    created++;
  }

  return created;
}

async function processMessages(messages, userId, lastResetAt = 0) {
  const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  // Ignora mensagens anteriores ao último reset de dados
  const minTimestamp = Math.max(oneDayAgo, lastResetAt);
  let processed = 0, skipped = 0, errors = 0;

  for (const msg of messages) {
    const messageId = msg.key?.id;
    const timestamp = msg.messageTimestamp || 0;
    if (timestamp && timestamp < minTimestamp) { skipped++; continue; }
    if (await isAlreadyProcessed(messageId)) { skipped++; continue; }
    try {
      const txs = await processPolledMessage(msg, userId);
      processed += txs;
    } catch (err) {
      console.error('[Polling] Erro:', err.message);
      errors++;
    }
  }
  return { processed, skipped, errors };
}

/**
 * Executa o polling para um usuário específico.
 * Usa lock distribuído para evitar execuções simultâneas (race condition).
 */
async function pollForUser(userId, config) {
  const results = { checked: 0, processed: 0, skipped: 0, errors: 0 };

  try {
    // LOCK: impede que dois polls rodem ao mesmo tempo para o mesmo usuário
    const lockRef = db.collection('pollingLocks').doc(userId);
    const lockDoc = await lockRef.get();
    const lockAge = lockDoc.exists
      ? (Math.floor(Date.now() / 1000) - (lockDoc.data().lockedAt || 0))
      : 999;

    if (lockAge < 60) {
      // Outro poll rodou há menos de 60s — pula para evitar duplicação
      console.log(`[Polling] Lock ativo para ${userId}, pulando.`);
      return results;
    }
    await lockRef.set({ lockedAt: Math.floor(Date.now() / 1000) });

    // Timestamp do último reset — só processa mensagens posteriores
    const lastResetAt = config.lastResetAt || 0;

    // 1. Polling do GRUPO — captura fromMe (Kirk) E fromMe:false (Raquel e outros)
    // O webhook já processa mensagens de terceiros, mas o polling serve de fallback
    // A deduplicação por messageId evita processamento duplo
    const groupMessagesOwn = await fetchGroupMessages(config, config.groupId, { fromMe: true, limit: 50 });
    const groupMessagesOthers = await fetchGroupMessages(config, config.groupId, { fromMe: false, limit: 50 });
    const groupMessages = [...groupMessagesOwn, ...groupMessagesOthers];
    results.checked += groupMessages.length;
    const groupResult = await processMessages(groupMessages, userId, lastResetAt);
    results.processed += groupResult.processed;
    results.skipped += groupResult.skipped;
    results.errors += groupResult.errors;

    // 2. Polling da AUTO-CONVERSA ("Mensagens para mim")
    const ownJid = await fetchOwnJid(config);
    if (ownJid) {
      const selfMessages = await fetchGroupMessages(config, ownJid, { fromMe: undefined, limit: 50 });
      results.checked += selfMessages.length;
      const selfResult = await processMessages(selfMessages, userId, lastResetAt);
      results.processed += selfResult.processed;
      results.skipped += selfResult.skipped;
      results.errors += selfResult.errors;
    }

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
