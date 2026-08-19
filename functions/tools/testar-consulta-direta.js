/**
 * Prova a camada de consulta SEM IA contra o Firestore real, e mede o ganho.
 *
 * Duas coisas ao mesmo tempo:
 *
 * 1. **Correção.** O número que a camada direta responde é o mesmo que sai da
 *    agregação. Se divergir, é bug grave — o cliente leria um valor errado com
 *    cara de exato.
 * 2. **Cobertura e economia.** Quantas das perguntas reais são atendidas sem
 *    IA, e quanto isso representa em dinheiro.
 *
 * As perguntas são as que o Kirk fez de verdade no teste ao vivo de 19/08,
 * mais as variações que precisam CAIR PARA A IA — porque acertar o que a
 * camada recusa importa tanto quanto acertar o que ela responde.
 *
 *   ALVO=staging node tools/testar-consulta-direta.js
 */

const { carregar } = require('./carregarAmbiente');

if (String(process.env.ALVO || '').toLowerCase() !== 'staging') {
  console.error('\n  Este script só roda em homologação. Use:');
  console.error('    ALVO=staging node tools/testar-consulta-direta.js\n');
  process.exit(1);
}

carregar(['GEMINI_API_KEY']);

const { db, admin } = require('../src/config/firebaseAdmin');
const { escopoDe } = require('../src/data/escopo');
const { criarConsultaFinanceira } = require('../src/services/consultaFinanceiraService');
const { criarConsultaDireta } = require('../src/services/consultaDiretaService');
const transactionService = require('../src/services/transactionService');
const categoryService = require('../src/services/categoryService');
const subcategoryService = require('../src/services/subcategoryService');
const budgetService = require('../src/services/budgetService');
const recurringBillService = require('../src/services/recurringBillService');

const FAMILIA = `direta-${Date.now()}`;
const CUSTO_COM_IA = 0.0453; // medido nesta mesma bateria, gemini-3.6-flash

let passou = 0;
let falhou = 0;

function checar(titulo, condicao, detalhe = '') {
  if (condicao) {
    passou += 1;
    console.log(`  OK    ${titulo}`);
  } else {
    falhou += 1;
    console.log(`  FALHA ${titulo}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

function mesCorrente() {
  const a = new Date();
  return `${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, '0')}`;
}

function mesPassado() {
  const a = new Date();
  const d = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function plantar() {
  const dados = escopoDe(FAMILIA);

  const mercado = await dados.criar('categories', { name: 'Mercado', type: 'EXPENSE', color: '#22c55e' });
  const moradia = await dados.criar('categories', { name: 'Moradia', type: 'EXPENSE', color: '#f59e0b' });
  const lazer = await dados.criar('categories', { name: 'Lazer', type: 'EXPENSE', color: '#a855f7' });
  const salario = await dados.criar('categories', { name: 'Salário', type: 'INCOME', color: '#3b82f6' });
  const padaria = await dados.criar('subcategories', { name: 'Padaria', categoryId: mercado.id });

  const lancar = async (desc, valor, cat, mes, tipo = 'EXPENSE', sub = null) => {
    await dados.criar('transactions', {
      type: tipo, description: desc, amount: valor, categoryId: cat,
      subcategoryId: sub, paymentMethodId: null,
      date: admin.firestore.Timestamp.fromDate(new Date(`${mes}-10T12:00:00Z`)),
      referenceMonth: mes, status: 'CONFIRMED', origin: 'MANUAL', paidBy: 'Kirk',
    });
  };

  const mes = mesCorrente();
  const anterior = mesPassado();

  await lancar('compra do mês', 480, mercado.id, mes);
  await lancar('pão', 95, mercado.id, mes, 'EXPENSE', padaria.id);
  await lancar('aluguel', 1400, moradia.id, mes);
  await lancar('cinema', 60, lazer.id, mes);
  await lancar('salário', 5000, salario.id, mes, 'INCOME');
  await lancar('compra do mês passado', 300, mercado.id, anterior);

  return { mes, anterior };
}

async function limpar() {
  for (const c of ['transactions', 'categories', 'subcategories', 'paymentMethods', 'chatSessions']) {
    const snap = await db.collection(c).where('householdId', '==', FAMILIA).get();
    if (!snap.size) continue;
    const lote = db.batch();
    snap.docs.forEach((d) => lote.delete(d.ref));
    await lote.commit();
  }
  await db.collection('households').doc(FAMILIA).delete().catch(() => {});
}

async function principal() {
  console.log('\n=== CAMADA DE CONSULTA SEM IA — contra o Firestore real ===');
  console.log(`Família descartável: ${FAMILIA}\n`);

  await db.collection('households').doc(FAMILIA).set({
    name: 'Família da consulta direta',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const { mes } = await plantar();

  const consulta = criarConsultaFinanceira({
    transactionService, categoryService, subcategoryService, budgetService, recurringBillService,
  });
  const direta = criarConsultaDireta({ consulta });
  const dados = escopoDe(FAMILIA);

  const perguntar = (texto) => direta.responder({
    dados, pergunta: texto, canal: 'WHATSAPP', nomeDaIA: 'Nina', mesCorrente: mes,
  });

  // ---- 1. O número tem que bater com a agregação ----
  console.log('1. O número responde igual à agregação (sem IA no meio)');

  const verdade = await consulta.gastoPorCategoria(dados, { mes, categoria: 'Mercado' });
  const totalMercado = verdade.categorias[0].total;

  const r1 = await perguntar('Quanto gastei no mercado esse mês?');
  checar('respondeu sem IA', !!r1, 'devolveu null');
  checar(`o valor bate com a agregação (R$ ${totalMercado})`,
    !!r1 && r1.texto.includes('575,00'), r1 ? r1.texto.slice(0, 80) : '');
  checar('trouxe a subcategoria junto', !!r1 && r1.texto.includes('Padaria'));

  const r2 = await perguntar('quanto gastei esse mês no total');
  checar('resumo do mês responde sem IA', !!r2);
  checar('mostra receita, despesa e saldo',
    !!r2 && r2.texto.includes('5.000,00') && r2.texto.includes('2.035,00'),
    r2 ? r2.texto.replace(/\n/g, ' ').slice(0, 100) : '');

  const r3 = await perguntar('Me mostra onde estou gastando demais');
  checar('maior gasto responde sem IA', !!r3);
  checar('aponta Moradia como maior', !!r3 && r3.texto.includes('Moradia'));

  const r4 = await perguntar('Detalhe os gastos de moradia');
  checar('detalhe vira lista de lançamentos', !!r4 && r4.texto.includes('aluguel'),
    r4 ? r4.texto.replace(/\n/g, ' ').slice(0, 90) : 'null');

  const r5 = await perguntar('compare com o mês passado');
  checar('comparativo responde sem IA', !!r5);
  checar('cita os dois meses', !!r5 && r5.texto.includes('300,00'),
    r5 ? r5.texto.replace(/\n/g, ' ').slice(0, 90) : '');

  const r6 = await perguntar('Qual seu nome ?');
  checar('o nome não gasta IA', !!r6 && r6.texto.includes('Nina'));

  const r7 = await perguntar('abre o mês por categoria');
  checar('quebra por categoria responde sem IA', !!r7 && r7.texto.includes('Moradia'));

  // ---- 2. O que ela TEM que recusar ----
  console.log('\n2. O que precisa cair para a IA (recusar é tão importante quanto responder)');

  const deveCairNaIA = [
    ['conselho', 'Como posso economizar em mercado?'],
    ['conselho de receita', 'como posso aumentar minha receita?'],
    ['julgamento', 'gastei 300 no mercado, tá muito?'],
    ['recorte semanal', 'quanto gastei no mercado essa semana?'],
    ['recorte de dia', 'quanto gastei ontem'],
    ['aritmética', 'quanto é 15% do que gastei no mercado?'],
    ['pergunta solta', 'quem é Raquel?'],
    ['categoria inexistente', 'quanto gastei em pet shop esse mês?'],
  ];

  for (const [rotulo, texto] of deveCairNaIA) {
    const r = await perguntar(texto);
    checar(`${rotulo}: vai para a IA`, r === null,
      r ? `respondeu sozinho: ${r.texto.slice(0, 60)}` : '');
  }

  // ---- 3. Quanto isso economiza ----
  console.log('\n3. Cobertura e economia');

  const reais = [
    'Quanto gastei no mercado esse mês?', 'Detalhe os gastos de moradia',
    'Abre agosto por categoria', 'Compare meus gastos desse mês com o mês passado',
    'Me mostra onde estou gastando demais', 'Qual seu nome ?',
    'quanto gastei esse mês no total', 'quanto gastei em lazer',
    'Como posso economizar?', 'como aumentar minha receita?',
  ];

  let semIA = 0;
  for (const p of reais) {
    if (await perguntar(p)) semIA += 1;
  }

  const cobertura = Math.round((semIA / reais.length) * 100);
  console.log(`\n  Perguntas respondidas SEM IA: ${semIA} de ${reais.length}  (${cobertura}%)`);
  console.log(`  Custo dessas com IA seria    : R$ ${(semIA * CUSTO_COM_IA).toFixed(4)}`);
  console.log('  Custo agora                  : R$ 0,0000');

  const mensalAntes = reais.length * CUSTO_COM_IA * 30;
  const mensalAgora = (reais.length - semIA) * CUSTO_COM_IA * 30;
  console.log(`\n  Projeção (10 perguntas/dia, 1 família):`);
  console.log(`    antes : R$ ${mensalAntes.toFixed(2)}/mês`);
  console.log(`    agora : R$ ${mensalAgora.toFixed(2)}/mês`);
  console.log(`    queda : ${Math.round((1 - mensalAgora / mensalAntes) * 100)}%`);

  checar('cobertura de pelo menos 70%', cobertura >= 70, `deu ${cobertura}%`);

  console.log(`\n===== ${passou} passaram, ${falhou} falharam =====\n`);

  await limpar();
  console.log('Família de teste apagada.\n');
  return falhou === 0;
}

principal()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch(async (err) => {
    console.error('\nFalhou:', err.message);
    console.error(err.stack);
    await limpar().catch(() => {});
    process.exit(1);
  });
