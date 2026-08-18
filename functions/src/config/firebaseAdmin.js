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

// Qual credencial local usar. Só importa fora do Firebase Functions (onde as
// credenciais vêm do próprio ambiente).
//
// Sem ALVO, é a chave de produção — exatamente como sempre foi, para nenhum
// comando existente mudar de comportamento. Com ALVO=staging, é a chave do
// projeto de staging, e a FALTA dela é erro fatal: cair de volta em produção
// em silêncio seria a pior falha possível deste arquivo.
function credencialLocal() {
  const fs = require('fs');
  const path = require('path');

  const ehStaging = String(process.env.ALVO || '').toLowerCase() === 'staging';
  const arquivo = ehStaging ? 'serviceAccountKey.staging.json' : 'serviceAccountKey.json';
  const caminho = path.join(__dirname, '..', '..', arquivo);

  if (ehStaging && !fs.existsSync(caminho)) {
    throw new Error(
      `ALVO=staging pedido, mas ${arquivo} não existe em functions/.\n` +
      'Sem essa chave o script cairia no Firestore de PRODUÇÃO. Baixe a chave ' +
      'de conta de serviço do projeto revelacash-staging e salve com esse nome.'
    );
  }

  const credencial = require(caminho);

  // O aviso mora AQUI, e não no carregador de ambiente de tools/, porque este
  // arquivo é o único ponto por onde TODO script que fala com o banco passa
  // obrigatoriamente. `src/seed.js`, por exemplo, não usa tools/carregarAmbiente
  // — rodou sem anunciar nada, que é justamente o silêncio perigoso.
  const rotulo = ehStaging ? 'STAGING — ambiente de teste' : 'PRODUÇÃO — DADOS REAIS DE CLIENTES';
  console.log(`\n  [${rotulo}] ${credencial.project_id}\n`);

  return credencial;
}

if (!admin.apps.length) {
  // Em produção (Firebase Functions) usa credenciais automáticas do ambiente
  // Em desenvolvimento usa o arquivo de chave local
  if (process.env.NODE_ENV !== 'production') {
    admin.initializeApp({ credential: admin.credential.cert(credencialLocal()) });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

module.exports = { admin, db };
