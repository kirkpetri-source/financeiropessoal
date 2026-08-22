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
function caminhoDaChaveLocal() {
  const path = require('path');
  const ehStaging = String(process.env.ALVO || '').toLowerCase() === 'staging';
  const arquivo = ehStaging ? 'serviceAccountKey.staging.json' : 'serviceAccountKey.json';
  return path.join(__dirname, '..', '..', arquivo);
}

function credencialLocal() {
  const fs = require('fs');

  const ehStaging = String(process.env.ALVO || '').toLowerCase() === 'staging';
  const arquivo = ehStaging ? 'serviceAccountKey.staging.json' : 'serviceAccountKey.json';
  const caminho = caminhoDaChaveLocal();

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

// Qual projeto estamos usando, de verdade.
//
// `admin.app().options.projectId` vem VAZIO quando o app é inicializado com
// `cert()` — ou seja, em todo script de tools/. Dentro de Cloud Functions o
// ambiente define GCLOUD_PROJECT e tudo funciona, o que faz a diferença passar
// despercebida até alguém precisar do id fora dali (foi o que aconteceu com o
// backup: `databasePath(undefined, ...)` estourava com um erro sem relação
// aparente, "Cannot read properties of undefined").
let projectId = null;

// Caminho do arquivo de chave em uso, quando existe (só fora de Functions).
//
// Clientes do Google Cloud que NÃO passam pelo firebase-admin — o
// `FirestoreAdminClient` do backup é o caso — não enxergam a credencial que o
// `initializeApp` recebeu e vão procurar as "default credentials" do ambiente,
// que numa máquina de desenvolvimento não existem. Exportar o caminho deixa
// esses clientes apontarem para a MESMA chave, e portanto para o mesmo
// projeto que o anúncio de ambiente acabou de imprimir.
let caminhoDaCredencial = null;

if (!admin.apps.length) {
  // Em produção (Firebase Functions) usa credenciais automáticas do ambiente
  // Em desenvolvimento usa o arquivo de chave local
  if (process.env.NODE_ENV !== 'production') {
    const credencial = credencialLocal();
    projectId = credencial.project_id;
    caminhoDaCredencial = caminhoDaChaveLocal();
    admin.initializeApp({ credential: admin.credential.cert(credencial) });
  } else {
    admin.initializeApp();
  }
}

if (!projectId) {
  projectId = admin.app().options.projectId
    || process.env.GCLOUD_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || null;
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

module.exports = { admin, db, projectId, caminhoDaCredencial };
