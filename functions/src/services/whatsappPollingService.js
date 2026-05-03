const { db, admin } = require('../config/firebaseAdmin');
const { fetchGroupMessages, fetchOwnJid } = require('./evolutionApiService');
const { parseFinancialMessage } = require('../utils/financialParser');
const { createTransaction } = require('./transactionService');

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
      notes: `Via WhatsApp. Enviado por: ${senderName || 'Você'}`,
      origin: 'WHATSAPP',
      status: 'CONFIRMED',
    });

    await logRef.update({ processingStatus: 'PROCESSED', transactionId: transaction.id });
    created++;
  }

  return created;
}

async function processMessages(messages, userId) {
  const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  let processed = 0, skipped = 0, errors = 0;

  for (const msg of messages) {
    const messageId = msg.key?.id;
    const timestamp = msg.messageTimestamp || 0;
    if (timestamp && timestamp < oneDayAgo) { skipped++; continue; }
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
 * Verifica: (1) grupo configurado, (2) auto-conversa ("Mensagens para mim").
 */
async function pollForUser(userId, config) {
  const results = { checked: 0, processed: 0, skipped: 0, errors: 0 };

  try {
    // 1. Polling do GRUPO (mensagens fromMe enviadas no grupo)
    const groupMessages = await fetchGroupMessages(config, config.groupId, { fromMe: true, limit: 50 });
    results.checked += groupMessages.length;
    const groupResult = await processMessages(groupMessages, userId);
    results.processed += groupResult.processed;
    results.skipped += groupResult.skipped;
    results.errors += groupResult.errors;

    // 2. Polling da AUTO-CONVERSA ("Mensagens para mim")
    const ownJid = await fetchOwnJid(config);
    if (ownJid) {
      // Sem filtro fromMe para garantir que pega mensagens recentes sem delay de indexação
      const selfMessages = await fetchGroupMessages(config, ownJid, { fromMe: undefined, limit: 50 });
      results.checked += selfMessages.length;
      const selfResult = await processMessages(selfMessages, userId);
      results.processed += selfResult.processed;
      results.skipped += selfResult.skipped;
      results.errors += selfResult.errors;
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
