const { admin, db } = require('../config/firebaseAdmin');

async function listCategories(userId) {
  const [defaultSnap, userSnap] = await Promise.all([
    db.collection('categories').where('isDefault', '==', true).get(),
    db.collection('categories').where('userId', '==', userId).get(),
  ]);

  const defaults = defaultSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const userCats = userSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return [...defaults, ...userCats].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

async function createCategory(userId, data) {
  const ref = await db.collection('categories').add({
    userId,
    isDefault: false,
    name: data.name,
    type: data.type,
    color: data.color || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const doc = await ref.get();
  return { id: doc.id, ...doc.data() };
}

async function updateCategory(userId, categoryId, data) {
  const ref = db.collection('categories').doc(categoryId);
  const doc = await ref.get();

  if (!doc.exists || doc.data().userId !== userId) {
    throw Object.assign(new Error('Categoria não encontrada ou não pode ser editada.'), { statusCode: 404 });
  }

  await ref.update({
    name: data.name,
    type: data.type,
    color: data.color ?? doc.data().color,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const updated = await ref.get();
  return { id: updated.id, ...updated.data() };
}

async function deleteCategory(userId, categoryId) {
  const ref = db.collection('categories').doc(categoryId);
  const doc = await ref.get();

  if (!doc.exists || doc.data().userId !== userId) {
    throw Object.assign(new Error('Categoria não encontrada ou não pode ser excluída.'), { statusCode: 404 });
  }

  const inUse = await db.collection('transactions')
    .where('userId', '==', userId)
    .where('categoryId', '==', categoryId)
    .limit(1)
    .get();

  if (!inUse.empty) {
    throw Object.assign(new Error('Categoria em uso em lançamentos.'), { statusCode: 409 });
  }

  await ref.delete();
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory };
