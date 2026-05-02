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

module.exports = { listLogs, createLog, updateLog };
