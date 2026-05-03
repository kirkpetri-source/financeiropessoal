const { admin, db } = require('../config/firebaseAdmin');
const { format } = require('date-fns');

function buildReferenceMonth(dateStr) {
  return format(new Date(dateStr), 'yyyy-MM');
}

async function listTransactions(userId, filters = {}) {
  const { month, type, categoryId, paymentMethodId, origin, paidBy } = filters;

  let query = db.collection('transactions').where('userId', '==', userId);

  if (month) query = query.where('referenceMonth', '==', month);
  if (type) query = query.where('type', '==', type);

  const snap = await query.orderBy('date', 'desc').get();
  let results = snap.docs.map((d) => ({ id: d.id, ...d.data(), date: d.data().date?.toDate?.() || d.data().date }));

  if (categoryId) results = results.filter((t) => t.categoryId === categoryId);
  if (paymentMethodId) results = results.filter((t) => t.paymentMethodId === paymentMethodId);
  if (origin) results = results.filter((t) => t.origin === origin);
  if (paidBy) results = results.filter((t) => t.paidBy?.toLowerCase() === paidBy.toLowerCase());

  return enrichTransactions(results);
}

async function createTransaction(userId, data) {
  const referenceMonth = buildReferenceMonth(data.date);

  const ref = await db.collection('transactions').add({
    userId,
    type: data.type,
    description: data.description,
    amount: Number(data.amount),
    categoryId: data.categoryId,
    paymentMethodId: data.paymentMethodId,
    date: admin.firestore.Timestamp.fromDate(new Date(data.date)),
    referenceMonth,
    notes: data.notes || null,
    origin: data.origin || 'MANUAL',
    status: data.status || 'CONFIRMED',
    paidBy: data.paidBy || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const doc = await ref.get();
  const tx = { id: doc.id, ...doc.data(), date: doc.data().date?.toDate?.() };
  return enrichTransactions([tx]).then((list) => list[0]);
}

async function updateTransaction(userId, transactionId, data) {
  const ref = db.collection('transactions').doc(transactionId);
  const doc = await ref.get();

  if (!doc.exists || doc.data().userId !== userId) {
    throw Object.assign(new Error('Lançamento não encontrado.'), { statusCode: 404 });
  }

  const updateData = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

  if (data.type !== undefined) updateData.type = data.type;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.amount !== undefined) updateData.amount = Number(data.amount);
  if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
  if (data.paymentMethodId !== undefined) updateData.paymentMethodId = data.paymentMethodId;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.origin !== undefined) updateData.origin = data.origin;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.paidBy !== undefined) updateData.paidBy = data.paidBy;

  if (data.date !== undefined) {
    updateData.date = admin.firestore.Timestamp.fromDate(new Date(data.date));
    updateData.referenceMonth = buildReferenceMonth(data.date);
  }

  await ref.update(updateData);
  const updated = await ref.get();
  const tx = { id: updated.id, ...updated.data(), date: updated.data().date?.toDate?.() };
  return enrichTransactions([tx]).then((list) => list[0]);
}

async function deleteTransaction(userId, transactionId) {
  const ref = db.collection('transactions').doc(transactionId);
  const doc = await ref.get();

  if (!doc.exists || doc.data().userId !== userId) {
    throw Object.assign(new Error('Lançamento não encontrado.'), { statusCode: 404 });
  }

  await ref.delete();
}

async function getMonthlySummary(userId, month) {
  const snap = await db.collection('transactions')
    .where('userId', '==', userId)
    .where('referenceMonth', '==', month)
    .get();

  const transactions = snap.docs.map((d) => ({
    id: d.id, ...d.data(), date: d.data().date?.toDate?.(),
  }));

  const confirmed = transactions.filter((t) => t.status === 'CONFIRMED');

  const totalIncome = confirmed.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
  const totalExpense = confirmed.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;

  // Buscar nomes de categorias para enriquecer
  const enriched = await enrichTransactions(transactions);

  const expenseByCategory = {};
  enriched.filter((t) => t.type === 'EXPENSE' && t.status === 'CONFIRMED').forEach((t) => {
    const key = t.category?.name || 'Outros';
    if (!expenseByCategory[key]) {
      expenseByCategory[key] = { name: key, value: 0, color: t.category?.color || '#94a3b8', id: t.categoryId };
    }
    expenseByCategory[key].value += t.amount;
  });

  const expenseByCategoryArr = Object.values(expenseByCategory).sort((a, b) => b.value - a.value);
  const topCategory = expenseByCategoryArr[0] || null;

  const recentTransactions = enriched.sort((a, b) => {
    const da = a.date instanceof Date ? a.date : new Date(a.date);
    const db2 = b.date instanceof Date ? b.date : new Date(b.date);
    return db2 - da;
  }).slice(0, 10);

  // Breakdown por pagador
  const byPayer = {};
  enriched.filter((t) => t.status === 'CONFIRMED').forEach((t) => {
    const payer = t.paidBy || 'Sem identificação';
    if (!byPayer[payer]) byPayer[payer] = { name: payer, income: 0, expense: 0 };
    if (t.type === 'INCOME') byPayer[payer].income += t.amount;
    else byPayer[payer].expense += t.amount;
  });
  const byPayerArr = Object.values(byPayer).sort((a, b) => b.expense - a.expense);

  return { month, totalIncome, totalExpense, balance, topCategory, expenseByCategory: expenseByCategoryArr, recentTransactions, byPayer: byPayerArr };
}

// Enriquece transações com nome/cor de categoria e nome de forma de pagamento
async function enrichTransactions(transactions) {
  if (!transactions.length) return [];

  const categoryIds = [...new Set(transactions.map((t) => t.categoryId).filter(Boolean))];
  const pmIds = [...new Set(transactions.map((t) => t.paymentMethodId).filter(Boolean))];

  const [catDocs, pmDocs] = await Promise.all([
    Promise.all(categoryIds.map((id) => db.collection('categories').doc(id).get())),
    Promise.all(pmIds.map((id) => db.collection('paymentMethods').doc(id).get())),
  ]);

  const catMap = {};
  catDocs.forEach((d) => { if (d.exists) catMap[d.id] = { id: d.id, ...d.data() }; });

  const pmMap = {};
  pmDocs.forEach((d) => { if (d.exists) pmMap[d.id] = { id: d.id, ...d.data() }; });

  return transactions.map((t) => ({
    ...t,
    category: catMap[t.categoryId] || { id: t.categoryId, name: 'Desconhecida', color: '#94a3b8' },
    paymentMethod: pmMap[t.paymentMethodId] || { id: t.paymentMethodId, name: 'Desconhecido' },
  }));
}

module.exports = { listTransactions, createTransaction, updateTransaction, deleteTransaction, getMonthlySummary };
