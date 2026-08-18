/**
 * Cria uma conta completa em HOMOLOGAÇÃO para testar a tela no navegador:
 * usuário com senha, família pagante, categorias, subcategorias e lançamentos
 * — incluindo o caso ambíguo do mesmo nome de subcategoria em duas categorias.
 *
 * Só roda em homologação, e imprime a senha na tela de propósito: é uma conta
 * descartável de um banco sem cliente nenhum.
 *
 *   ALVO=staging node tools/criar-conta-de-teste-staging.js
 *   ALVO=staging node tools/criar-conta-de-teste-staging.js --apagar
 */

const { carregar } = require('./carregarAmbiente');

if (String(process.env.ALVO || '').toLowerCase() !== 'staging') {
  console.error('\n  Este script só roda em homologação. Use:');
  console.error('    ALVO=staging node tools/criar-conta-de-teste-staging.js\n');
  process.exit(1);
}

carregar([]);

const { db, admin } = require('../src/config/firebaseAdmin');
const { escopoDe } = require('../src/data/escopo');

const EMAIL = 'teste@revelacash.invalid';
const SENHA = 'teste-da-nina-123';
const UID = 'uid-teste-tela';
const FAMILIA = 'familia-teste-tela';

function mes(offset = 0) {
  const agora = new Date();
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function apagar() {
  try { await admin.auth().deleteUser(UID); } catch { /* já não existia */ }
  await db.collection('users').doc(UID).delete();

  const membros = await db.collection('households').doc(FAMILIA).collection('members').get();
  for (const m of membros.docs) await m.ref.delete();
  await db.collection('households').doc(FAMILIA).delete();

  for (const colecao of ['transactions', 'categories', 'subcategories', 'paymentMethods', 'chatSessions']) {
    const snap = await db.collection(colecao).where('householdId', '==', FAMILIA).get();
    const lote = db.batch();
    snap.docs.forEach((d) => lote.delete(d.ref));
    if (snap.size) await lote.commit();
  }
  await db.collection('whatsappConfigs').doc(FAMILIA).delete().catch(() => {});
}

async function criar() {
  await apagar();

  await admin.auth().createUser({ uid: UID, email: EMAIL, password: SENHA, emailVerified: true });

  await db.collection('households').doc(FAMILIA).set({
    name: 'Família de teste',
    subscription: {
      status: 'active',
      provider: 'manual',
      priceCents: 2490,
      currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('households').doc(FAMILIA).collection('members').doc(UID).set({
    role: 'owner', name: 'Kirk', createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('users').doc(UID).set({ householdId: FAMILIA, name: 'Kirk' });

  const dados = escopoDe(FAMILIA);

  const lazer = await dados.criar('categories', { name: 'Lazer', type: 'EXPENSE', color: '#a855f7' });
  const educacao = await dados.criar('categories', { name: 'Educação', type: 'EXPENSE', color: '#3b82f6' });
  const mercado = await dados.criar('categories', { name: 'Mercado', type: 'EXPENSE', color: '#22c55e' });
  const salario = await dados.criar('categories', { name: 'Salário', type: 'INCOME', color: '#0d9488' });
  const pix = await dados.criar('paymentMethods', { name: 'Pix' });

  // O caso ambíguo de propósito: "Futebol" em duas categorias.
  const futLazer = await dados.criar('subcategories', { name: 'Futebol', categoryId: lazer.id });
  const futEscola = await dados.criar('subcategories', { name: 'Futebol', categoryId: educacao.id });
  const padaria = await dados.criar('subcategories', { name: 'Padaria', categoryId: mercado.id });

  const lancar = async (desc, valor, cat, sub, quando, quem, tipo = 'EXPENSE') => {
    await dados.criar('transactions', {
      type: tipo,
      description: desc,
      amount: valor,
      categoryId: cat,
      subcategoryId: sub || null,
      paymentMethodId: pix.id,
      date: admin.firestore.Timestamp.fromDate(new Date(`${quando}-10T12:00:00Z`)),
      referenceMonth: quando,
      status: 'CONFIRMED',
      origin: 'MANUAL',
      paidBy: quem,
    });
  };

  const atual = mes();
  const anterior = mes(-1);

  await lancar('salário', 5000, salario.id, null, atual, 'Kirk', 'INCOME');
  await lancar('ingresso do jogo', 120, lazer.id, futLazer.id, atual, 'Kirk');
  await lancar('churrasco no estádio', 60, lazer.id, futLazer.id, atual, 'Kirk');
  await lancar('escolinha do joão', 300, educacao.id, futEscola.id, atual, 'Raquel');
  await lancar('pão e leite', 40, mercado.id, padaria.id, atual, 'Raquel');
  await lancar('compra do mês', 480, mercado.id, null, atual, 'Kirk');

  await lancar('salário', 5000, salario.id, null, anterior, 'Kirk', 'INCOME');
  await lancar('compra do mês', 390, mercado.id, null, anterior, 'Kirk');
  await lancar('cinema', 90, lazer.id, null, anterior, 'Raquel');

  console.log('\nConta de teste pronta em HOMOLOGAÇÃO:');
  console.log(`  e-mail: ${EMAIL}`);
  console.log(`  senha : ${SENHA}`);
  console.log(`\n  Família: ${FAMILIA} (assinante pagante)`);
  console.log(`  Dados em ${atual} e ${anterior}, com "Futebol" em Lazer e em Educação.`);
  console.log('\n  Rodar o frontend apontado para homologação:');
  console.log('    cd frontend && npm run dev -- --mode staging\n');
}

const principal = process.argv.includes('--apagar') ? apagar : criar;

principal()
  .then(() => {
    if (process.argv.includes('--apagar')) console.log('\nConta de teste apagada.\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Erro:', err.message);
    process.exit(1);
  });
