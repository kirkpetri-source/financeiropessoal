const { admin, db } = require('../config/firebaseAdmin');

async function listPaymentMethods(userId) {
  const [defaultSnap, userSnap] = await Promise.all([
    db.collection('paymentMethods').where('isDefault', '==', true).get(),
    db.collection('paymentMethods').where('userId', '==', userId).get(),
  ]);

  const defaults = defaultSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const userMethods = userSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return [...defaults, ...userMethods].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

async function createPaymentMethod(userId, name) {
  const ref = await db.collection('paymentMethods').add({
    userId,
    isDefault: false,
    name,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const doc = await ref.get();
  return { id: doc.id, ...doc.data() };
}

async function deletePaymentMethod(userId, id) {
  const ref = db.collection('paymentMethods').doc(id);
  const doc = await ref.get();

  if (!doc.exists || doc.data().userId !== userId) {
    throw Object.assign(new Error('Forma de pagamento não encontrada.'), { statusCode: 404 });
  }

  const inUse = await db.collection('transactions')
    .where('userId', '==', userId)
    .where('paymentMethodId', '==', id)
    .limit(1)
    .get();

  if (!inUse.empty) {
    throw Object.assign(new Error('Forma de pagamento em uso.'), { statusCode: 409 });
  }

  await ref.delete();
}

module.exports = { listPaymentMethods, createPaymentMethod, deletePaymentMethod };
