const admin = require('firebase-admin');

if (!admin.apps.length) {
  // Em produção (Firebase Functions) usa credenciais automáticas do ambiente
  // Em desenvolvimento usa o arquivo de chave local
  if (process.env.NODE_ENV !== 'production') {
    const serviceAccount = require('../../serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

module.exports = { admin, db };
