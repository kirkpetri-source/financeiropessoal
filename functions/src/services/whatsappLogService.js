const { admin, db } = require('../config/firebaseAdmin');

async function listLogs(userId, filters = {}) {
  const { status, messageType, limit = 50, offset = 0 } = filters;

  let query = db.collection('whatsappLogs').where('userId', '==', userId).orderBy('createdAt', 'desc');

  const snap = await query.get();
  let logs = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() }));

  if (status) logs = logs.filter((l) => l.processingStatus === status);
  if (messageType) logs = logs.filter((l) => l.messageType === messageType);

  const total = logs.length;
  const paginated = logs.slice(Number(offset), Number(offset) + Number(limit));

  // Enriquecer com dados da transação se houver
  const enriched = await Promise.all(paginated.map(async (log) => {
    if (!log.transactionId) return { ...log, transaction: null };
    const txDoc = await db.collection('transactions').doc(log.transactionId).get();
    if (!txDoc.exists) return { ...log, transaction: null };
    const tx = txDoc.data();
    return { ...log, transaction: { id: txDoc.id, description: tx.description, amount: tx.amount, type: tx.type } };
  }));

  return { logs: enriched, total };
}

async function createLog(data) {
  const ref = await db.collection('whatsappLogs').add({
    ...data,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const doc = await ref.get();
  return { id: doc.id, ...doc.data() };
}

async function updateLog(id, data) {
  await db.collection('whatsappLogs').doc(id).update(data);
}

async function deleteLog(userId, logId) {
  const ref = db.collection('whatsappLogs').doc(logId);
  const doc = await ref.get();

  if (!doc.exists || doc.data().userId !== userId) {
    throw Object.assign(new Error('Log não encontrado.'), { statusCode: 404 });
  }

  const transactionId = doc.data().transactionId;

  // IMPORTANTE: não apaga o log — marca como CANCELADO para manter a deduplicação.
  // Se apagássemos o log, o polling re-processaria a mesma mensagem do histórico do WhatsApp.
  await Promise.all([
    ref.update({
      processingStatus: 'CANCELLED',
      transactionId: null,
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    }),
    transactionId ? db.collection('transactions').doc(transactionId).delete() : Promise.resolve(),
  ]);
}

module.exports = { listLogs, createLog, updateLog, deleteLog };
