require('../../functions/src/config/firebaseAdmin');
const { admin, db } = require('./config/firebaseAdmin');
const { format, subDays, startOfMonth } = require('date-fns');

const EXPENSE_CATEGORIES = [
  { name: 'Alimentação', color: '#f97316' },
  { name: 'Mercado', color: '#84cc16' },
  { name: 'Transporte', color: '#06b6d4' },
  { name: 'Combustível', color: '#f59e0b' },
  { name: 'Moradia', color: '#8b5cf6' },
  { name: 'Energia', color: '#eab308' },
  { name: 'Água', color: '#3b82f6' },
  { name: 'Internet', color: '#6366f1' },
  { name: 'Saúde', color: '#ef4444' },
  { name: 'Farmácia', color: '#ec4899' },
  { name: 'Educação', color: '#14b8a6' },
  { name: 'Igreja/Doações', color: '#a855f7' },
  { name: 'Lazer', color: '#f43f5e' },
  { name: 'Assinaturas', color: '#0ea5e9' },
  { name: 'Cartão de Crédito', color: '#64748b' },
  { name: 'Empréstimos', color: '#dc2626' },
  { name: 'Outros', color: '#94a3b8' },
];

const INCOME_CATEGORIES = [
  { name: 'Salário', color: '#22c55e' },
  { name: 'Serviços', color: '#10b981' },
  { name: 'Vendas', color: '#34d399' },
  { name: 'Reembolso', color: '#6ee7b7' },
  { name: 'Renda Extra', color: '#059669' },
  { name: 'Outros', color: '#94a3b8' },
];

const PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Boleto', 'Transferência', 'Outro'];

async function upsertDoc(collection, id, data) {
  const ref = db.collection(collection).doc(id);
  const doc = await ref.get();
  if (!doc.exists) await ref.set({ ...data, createdAt: admin.firestore.FieldValue.serverTimestamp() });
}

async function main() {
  console.log('🌱 Iniciando seed do Firestore...\n');

  // Categorias padrão
  console.log('📁 Criando categorias padrão...');
  for (const cat of EXPENSE_CATEGORIES) {
    const id = `default-expense-${cat.name.toLowerCase().replace(/[^a-z]/g, '-')}`;
    await upsertDoc('categories', id, { name: cat.name, type: 'EXPENSE', color: cat.color, isDefault: true, userId: null });
  }
  for (const cat of INCOME_CATEGORIES) {
    const id = `default-income-${cat.name.toLowerCase().replace(/[^a-z]/g, '-')}`;
    await upsertDoc('categories', id, { name: cat.name, type: 'INCOME', color: cat.color, isDefault: true, userId: null });
  }
  console.log('  ✅ Categorias criadas.\n');

  // Formas de pagamento
  console.log('💳 Criando formas de pagamento...');
  for (const method of PAYMENT_METHODS) {
    const id = `default-pm-${method.toLowerCase().replace(/[^a-z]/g, '-')}`;
    await upsertDoc('paymentMethods', id, { name: method, isDefault: true, userId: null });
  }
  console.log('  ✅ Formas de pagamento criadas.\n');

  // Usuário admin no Firebase Auth
  console.log('👤 Criando usuário administrador...');
  let adminUser;
  try {
    adminUser = await admin.auth().getUserByEmail('admin@financeiro.local');
    console.log('  ℹ️  Usuário já existe:', adminUser.email);
  } catch {
    adminUser = await admin.auth().createUser({
      email: 'admin@financeiro.local',
      password: 'admin123',
      displayName: 'Administrador',
    });
    console.log('  ✅ Usuário criado:', adminUser.email);
  }

  // Perfil no Firestore
  await upsertDoc('users', adminUser.uid, { name: 'Administrador', email: 'admin@financeiro.local' });
  console.log('  ✅ Perfil salvo no Firestore.\n');

  // Buscar IDs de categorias e formas de pagamento pelo nome
  const findCat = async (name) => {
    const snap = await db.collection('categories').where('name', '==', name).where('isDefault', '==', true).limit(1).get();
    return snap.empty ? null : snap.docs[0].id;
  };
  const findPm = async (name) => {
    const snap = await db.collection('paymentMethods').where('name', '==', name).where('isDefault', '==', true).limit(1).get();
    return snap.empty ? null : snap.docs[0].id;
  };

  const [pixId, creditId, debitoId, transferenciaId] = await Promise.all([
    findPm('Pix'), findPm('Crédito'), findPm('Débito'), findPm('Transferência'),
  ]);
  const [catSalario, catMercado, catAlimentacao, catCombustivel, catEnergia, catInternet, catLazer, catServicos] = await Promise.all([
    findCat('Salário'), findCat('Mercado'), findCat('Alimentação'), findCat('Combustível'),
    findCat('Energia'), findCat('Internet'), findCat('Lazer'), findCat('Serviços'),
  ]);

  // Lançamentos de exemplo
  console.log('💰 Criando lançamentos de exemplo...');
  const now = new Date();
  const start = startOfMonth(now);

  const samples = [
    { type: 'INCOME', description: 'Salário do mês', amount: 4500, categoryId: catSalario, paymentMethodId: transferenciaId, date: start },
    { type: 'INCOME', description: 'Manutenção notebook cliente', amount: 250, categoryId: catServicos, paymentMethodId: pixId, date: subDays(now, 5) },
    { type: 'EXPENSE', description: 'Compras mercado da semana', amount: 284.90, categoryId: catMercado, paymentMethodId: debitoId, date: subDays(now, 3) },
    { type: 'EXPENSE', description: 'Gasolina carro', amount: 120, categoryId: catCombustivel, paymentMethodId: pixId, date: subDays(now, 7) },
    { type: 'EXPENSE', description: 'Conta de energia', amount: 245.30, categoryId: catEnergia, paymentMethodId: pixId, date: subDays(now, 10) },
    { type: 'EXPENSE', description: 'Internet fibra', amount: 109.90, categoryId: catInternet, paymentMethodId: debitoId, date: subDays(now, 8) },
    { type: 'EXPENSE', description: 'Almoço restaurante', amount: 58, categoryId: catAlimentacao, paymentMethodId: creditId, date: subDays(now, 2) },
    { type: 'EXPENSE', description: 'Cinema + pipoca', amount: 82, categoryId: catLazer, paymentMethodId: creditId, date: subDays(now, 4) },
  ];

  for (const t of samples) {
    await db.collection('transactions').add({
      userId: adminUser.uid,
      ...t,
      date: admin.firestore.Timestamp.fromDate(t.date),
      referenceMonth: format(t.date, 'yyyy-MM'),
      origin: 'MANUAL',
      status: 'CONFIRMED',
      notes: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  console.log(`  ✅ ${samples.length} lançamentos criados.\n`);

  console.log('✅ Seed concluído!\n');
  console.log('📋 Credenciais:');
  console.log('   E-mail: admin@financeiro.local');
  console.log('   Senha:  admin123\n');

  process.exit(0);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
