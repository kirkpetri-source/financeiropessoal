const { admin, db } = require('../config/firebaseAdmin');

/**
 * Configuração do canal WhatsApp — um documento por família, com o householdId
 * como ID (antes era por usuário).
 *
 * A chave da Evolution API nunca sai daqui em texto puro: getConfig devolve
 * mascarada, e updateConfig ignora o valor mascarado para não sobrescrever a
 * chave real com asteriscos quando o formulário é salvo sem alterá-la.
 */

const PADROES = {
  enabled: false,
  evolutionApiUrl: null,
  instanceName: null,
  apiKey: null,
  groupId: null,
  allowPrivateChat: false,
  payers: [],
  confirmationMessageTemplate: '✅ Lançamento registrado: {tipo} de R$ {valor} em {categoria}',
};

function mascarar(chave) {
  if (!chave) return null;
  return '••••••••' + String(chave).slice(-4);
}

async function getConfig(householdId) {
  const doc = await db.collection('whatsappConfigs').doc(householdId).get();
  const dados = doc.exists ? { ...PADROES, ...doc.data() } : { ...PADROES };

  return {
    ...dados,
    id: householdId,
    householdId,
    apiKey: mascarar(dados.apiKey),
    // Diagnóstico da última tentativa de leitura, para a tela mostrar o motivo
    // quando a integração para de funcionar.
    lastPollError: dados.lastPollError || null,
    lastPolledAt: dados.lastPolledAt?.toDate?.() || null,
  };
}

async function updateConfig(householdId, entrada) {
  const ref = db.collection('whatsappConfigs').doc(householdId);
  const doc = await ref.get();

  const alteracao = { ...entrada, householdId, updatedAt: admin.firestore.FieldValue.serverTimestamp() };

  // Formulário salvo sem mexer na chave devolve o valor mascarado — não pode
  // virar a chave de verdade.
  if (typeof alteracao.apiKey === 'string' && alteracao.apiKey.startsWith('••••')) {
    delete alteracao.apiKey;
  }
  if (alteracao.evolutionApiUrl === '') alteracao.evolutionApiUrl = null;

  if (doc.exists) {
    await ref.update(alteracao);
  } else {
    await ref.set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), ...alteracao });
  }

  return getConfig(householdId);
}

/**
 * Configuração completa e utilizável, com a chave em texto puro. Uso interno.
 *
 * Passa por `configEfetiva`: a URL e a API key vêm do SERVIDOR do operador
 * quando a família não tem as próprias. É o que permite ao cliente usar o
 * canal sem nunca ter visto essas palavras — ele só leu um QR Code.
 *
 * Família com credencial própria (a do Kirk, criada antes disto) continua
 * usando a dela.
 */
async function getRawConfig(householdId) {
  const doc = await db.collection('whatsappConfigs').doc(householdId).get();
  if (!doc.exists) return null;

  const { configEfetiva } = require('../config/evolutionServidor');
  return configEfetiva({ householdId, ...doc.data() });
}

module.exports = { getConfig, updateConfig, getRawConfig, PADROES };
