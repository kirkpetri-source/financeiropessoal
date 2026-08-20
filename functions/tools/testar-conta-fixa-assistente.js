/**
 * A Nina cadastra CONTA FIXA, e não só registra o pagamento dela.
 *
 * Até 20/08/2026 ela recusava: "não consigo cadastrar novas contas fixas
 * recorrentes no painel, mas posso registrar os pagamentos delas como
 * lançamentos normais". Mandava o cliente abrir o painel para uma coisa que
 * ela tinha tudo para fazer. Achado num teste real do Kirk.
 *
 * O que este script prova, contra o Firestore e o Gemini REAIS:
 *   1. o pedido vira conta fixa de verdade, com os campos certos
 *   2. o valor vai em CENTAVOS (falar 150 e gravar 150 centavos seria a conta
 *      errada todo mês, para sempre)
 *   3. "paguei a luz" continua virando LANÇAMENTO, não conta fixa
 *   4. faltando dado essencial, ela pergunta em vez de inventar
 *
 *   ALVO=staging node tools/testar-conta-fixa-assistente.js
 */

const { carregar } = require('./carregarAmbiente');

if (String(process.env.ALVO || '').toLowerCase() !== 'staging') {
  console.error('\n  Este script só roda em homologação. Use:');
  console.error('    ALVO=staging node tools/testar-conta-fixa-assistente.js\n');
  process.exit(1);
}

carregar(['GEMINI_API_KEY']);

const { db, admin } = require('../src/config/firebaseAdmin');
const { escopoDe } = require('../src/data/escopo');
const { criarConsultaFinanceira } = require('../src/services/consultaFinanceiraService');
const { criarAcoesFinanceiras } = require('../src/services/acoesFinanceirasService');
const { criarChatIA, chamarModeloReal } = require('../src/services/chatIAService');
const { criarChatSessionService } = require('../src/services/chatSessionService');
const transactionService = require('../src/services/transactionService');
const categoryService = require('../src/services/categoryService');
const subcategoryService = require('../src/services/subcategoryService');
const budgetService = require('../src/services/budgetService');
const recurringBillService = require('../src/services/recurringBillService');
const paymentMethodService = require('../src/services/paymentMethodService');
const { lancarPorTexto } = require('../src/services/lancamentoPorMensagem');

const FAMILIA = `contafixa-${Date.now()}`;

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

async function montar() {
  await db.collection('households').doc(FAMILIA).set({
    name: 'Família da conta fixa',
    subscription: {
      status: 'active', provider: 'manual', priceCents: 2490,
      currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const dados = escopoDe(FAMILIA);
  await dados.criar('categories', { name: 'Energia', type: 'EXPENSE', color: '#f59e0b' });
  await dados.criar('categories', { name: 'Moradia', type: 'EXPENSE', color: '#8b5cf6' });
  await dados.criar('categories', { name: 'Internet', type: 'EXPENSE', color: '#3b82f6' });
  await dados.criar('paymentMethods', { name: 'Pix' });
}

async function limpar() {
  for (const c of ['transactions', 'categories', 'subcategories', 'paymentMethods',
    'recurringBills', 'chatSessions', 'memoriaDeDescricao']) {
    const snap = await db.collection(c).where('householdId', '==', FAMILIA).get();
    if (!snap.size) continue;
    const lote = db.batch();
    snap.docs.forEach((d) => lote.delete(d.ref));
    await lote.commit();
  }
  await db.collection('households').doc(FAMILIA).delete().catch(() => {});
}

async function contasFixas() {
  const snap = await db.collection('recurringBills').where('householdId', '==', FAMILIA).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function principal() {
  console.log('\n=== A NINA CADASTRA CONTA FIXA ===');
  console.log(`Família descartável: ${FAMILIA}\n`);

  await montar();

  const consulta = criarConsultaFinanceira({
    transactionService, categoryService, subcategoryService, budgetService, recurringBillService,
  });
  const sessoes = criarChatSessionService();
  const acoes = criarAcoesFinanceiras({
    transactionService, categoryService, subcategoryService,
    recurringBillService, paymentMethodService, lancarPorTexto, sessoes,
  });
  const ia = criarChatIA({ consulta, acoes, sessoes, chamarModelo: chamarModeloReal });
  const dados = escopoDe(FAMILIA);

  const perguntar = (pergunta, interlocutor = `t-${Math.random()}`) => ia.responder({
    dados, pergunta, interlocutor, permissoes: { lancar: true },
    nomeDaIA: 'Nina', canal: 'WHATSAPP',
  });

  // 1. O pedido que ela recusava.
  console.log('1. "cadastra minha conta de luz, 150 reais, vence dia 10"');
  const r1 = await perguntar('cadastra minha conta fixa de luz, 150 reais, vence todo dia 10, categoria Energia');
  console.log(`   -> ${(r1.texto || '').replace(/\n/g, ' ').slice(0, 130)}`);
  checar('usou a ferramenta de conta fixa',
    (r1.ferramentasUsadas || []).includes('criarContaFixa'),
    `usou: ${(r1.ferramentasUsadas || []).join(', ') || 'nenhuma'}`);

  const criadas = await contasFixas();
  checar('criou UMA conta fixa no banco', criadas.length === 1, `criou ${criadas.length}`);

  if (criadas.length) {
    const c = criadas[0];
    console.log(`   -> banco: "${c.description}" ${c.amountCents} centavos, dia ${c.dueDay}, tipo ${c.type}`);
    // O erro que se repetiria todo mês: reais gravados como centavos.
    checar('o valor foi para centavos (15000, não 150)', c.amountCents === 15000,
      `amountCents=${c.amountCents}`);
    checar('o dia do vencimento está certo', c.dueDay === 10, `dueDay=${c.dueDay}`);
    checar('é despesa', c.type === 'EXPENSE', `type=${c.type}`);
    checar('nasceu ativa', c.active === true, `active=${c.active}`);
    checar('tem forma de pagamento (campo obrigatório)', !!c.paymentMethodId);

    const cat = await db.collection('categories').doc(c.categoryId).get();
    checar('caiu na categoria Energia', cat.data()?.name === 'Energia',
      `caiu em ${cat.data()?.name}`);
  }

  // 2. A FRONTEIRA: pagamento não é conta fixa.
  console.log('\n2. "paguei 80 de energia hoje" — é LANÇAMENTO, não conta fixa');
  const antes = (await contasFixas()).length;
  const r2 = await perguntar('paguei 80 de energia hoje no pix');
  console.log(`   -> ${(r2.texto || '').replace(/\n/g, ' ').slice(0, 110)}`);
  checar('NÃO criou conta fixa nova', (await contasFixas()).length === antes,
    'criou conta fixa para um pagamento avulso');
  checar('usou registrarLancamento',
    (r2.ferramentasUsadas || []).includes('registrarLancamento'),
    `usou: ${(r2.ferramentasUsadas || []).join(', ') || 'nenhuma'}`);

  // 3. Dado faltando: perguntar, nunca inventar.
  console.log('\n3. "cadastra minha internet como conta fixa" — falta valor e dia');
  const antes2 = (await contasFixas()).length;
  const r3 = await perguntar('cadastra minha internet como conta fixa');
  console.log(`   -> ${(r3.texto || '').replace(/\n/g, ' ').slice(0, 150)}`);
  checar('NÃO criou com dado inventado', (await contasFixas()).length === antes2,
    'criou conta fixa sem ter valor nem dia');
  checar('pediu o que falta', /valor|quanto|dia|vence/i.test(r3.texto || ''),
    'não perguntou nada');

  // 4. Receita recorrente também é conta fixa.
  console.log('\n4. Receita recorrente (salário)');
  const r4 = await perguntar('cadastra meu salário de 5000 como receita fixa todo dia 5, categoria Moradia');
  console.log(`   -> ${(r4.texto || '').replace(/\n/g, ' ').slice(0, 110)}`);
  const salario = (await contasFixas()).find((c) => c.type === 'INCOME');
  checar('criou como receita (INCOME)', !!salario, 'não criou nenhuma INCOME');
  if (salario) {
    checar('valor da receita em centavos', salario.amountCents === 500000,
      `amountCents=${salario.amountCents}`);
  }

  // 5. A conta fixa aparece na consulta.
  console.log('\n5. A conta cadastrada aparece quando perguntam');
  const r5 = await perguntar('quais são minhas contas fixas?');
  console.log(`   -> ${(r5.texto || '').replace(/\n/g, ' ').slice(0, 140)}`);
  checar('cita a conta de luz', /luz|energia/i.test(r5.texto || ''),
    'não citou a conta cadastrada');

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
