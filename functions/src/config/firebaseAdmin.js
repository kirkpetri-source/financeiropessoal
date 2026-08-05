const admin = require('firebase-admin');

// TRAVA DE SEGURANÇA — nunca conectar no banco real durante os testes.
//
// Um mock que não pega passa despercebido: o teste simplesmente usa o banco de
// verdade e escreve lixo em produção. Aconteceu uma vez aqui, com 4 documentos
// falsos criados na coleção transactions. Em vez de confiar no mock, a conexão
// real recusa a existir sob teste.
//
// Teste que precise de banco deve usar o emulador do Firebase e definir
// FIRESTORE_EMULATOR_HOST.
if (process.env.VITEST && !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    'firebaseAdmin foi carregado dentro de um teste sem emulador.\n' +
    'Isso conectaria no Firestore de PRODUÇÃO. Injete um banco falso no módulo ' +
    'sob teste (ex.: criarEscopo(dbFalso)) ou suba o emulador e defina ' +
    'FIRESTORE_EMULATOR_HOST.'
  );
}

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
