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

// A troca de senha NÃO passa mais pelo backend.
//
// O Admin SDK não sabe conferir a senha atual — ele simplesmente sobrescreve.
// O endpoint antigo recebia currentPassword e ignorava, então quem pegasse um
// token conseguia trocar a senha sem conhecer a anterior e tomar a conta.
//
// Agora o frontend reautentica com reauthenticateWithCredential() e chama
// updatePassword() do próprio Firebase Auth, que exige a senha atual de fato.
// Ver frontend/src/contexts/AuthContext.jsx.

module.exports = { getProfile, createOrUpdateProfile, updateProfile };
