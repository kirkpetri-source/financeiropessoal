const { admin, db } = require('../config/firebaseAdmin');

async function getProfile(userId) {
  const doc = await db.collection('users').doc(userId).get();
  if (!doc.exists) throw Object.assign(new Error('Usuário não encontrado.'), { statusCode: 404 });
  return { id: doc.id, ...doc.data() };
}

async function createOrUpdateProfile(userId, data) {
  const ref = db.collection('users').doc(userId);
  const doc = await ref.get();

  const payload = {
    name: data.name,
    email: data.email,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!doc.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(payload);
  } else {
    await ref.update(payload);
  }

  return getProfile(userId);
}

async function updateProfile(userId, name, email) {
  return createOrUpdateProfile(userId, { name, email });
}

// Firebase Auth cuida da troca de senha — esse endpoint apenas valida via Admin
async function changePassword(userId, newPassword) {
  await admin.auth().updateUser(userId, { password: newPassword });
}

module.exports = { getProfile, createOrUpdateProfile, updateProfile, changePassword };
