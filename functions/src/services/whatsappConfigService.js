const { admin, db } = require('../config/firebaseAdmin');

async function getConfig(userId) {
  const doc = await db.collection('whatsappConfigs').doc(userId).get();

  const defaults = {
    userId,
    enabled: false,
    evolutionApiUrl: null,
    instanceName: null,
    apiKey: null,
    groupId: null,
    confirmationMessageTemplate: '✅ Lançamento registrado: {tipo} de R$ {valor} em {categoria}',
  };

  const data = doc.exists ? { ...defaults, ...doc.data() } : defaults;

  return {
    ...data,
    id: userId,
    apiKey: data.apiKey ? '••••••••' + data.apiKey.slice(-4) : null,
  };
}

async function updateConfig(userId, data) {
  const ref = db.collection('whatsappConfigs').doc(userId);
  const doc = await ref.get();

  const updateData = { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() };

  // Não sobrescreve a apiKey se receber o valor mascarado
  if (data.apiKey && data.apiKey.startsWith('••••')) {
    delete updateData.apiKey;
  }
  // Limpar string vazia para null
  if (updateData.evolutionApiUrl === '') updateData.evolutionApiUrl = null;

  if (doc.exists) {
    await ref.update(updateData);
  } else {
    await ref.set({ userId, createdAt: admin.firestore.FieldValue.serverTimestamp(), ...updateData });
  }

  return getConfig(userId);
}

async function getRawConfig(userId) {
  const doc = await db.collection('whatsappConfigs').doc(userId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

module.exports = { getConfig, updateConfig, getRawConfig };
