/**
 * Mede o CUSTO REAL de uma pergunta à assistente, em tokens e em reais,
 * contra o Gemini de verdade.
 *
 * Existe porque a estimativa do desenho (R$ 0,03 por pergunta) foi feita no
 * papel e ignorava três coisas que só aparecem medindo:
 *
 *   1. o raciocínio do Gemini 3.x é cobrado como SAÍDA — o token mais caro —
 *      e são ~700 por chamada, mesmo pedindo moderação;
 *   2. uma pergunta que usa ferramenta custa VÁRIAS chamadas, e cada rodada
 *      reenvia a conversa inteira, então a entrada cresce a cada volta;
 *   3. pergunta SEM o nome da assistente paga uma chamada extra do parser,
 *      porque o sistema tenta interpretá-la como lançamento antes de
 *      descobrir que era pergunta.
 *
 * O número que sai daqui é o que decide se a cota de 20 conversas/dia cabe
 * numa assinatura de R$ 24,90.
 *
 *   ALVO=staging node tools/medir-custo-assistente.js
 */

const { carregar } = require('./carregarAmbiente');

if (String(process.env.ALVO || '').toLowerCase() !== 'staging') {
  console.error('\n  Este script só roda em homologação. Use:');
  console.error('    ALVO=staging node tools/medir-custo-assistente.js\n');
  process.exit(1);
}

carregar(['GEMINI_API_KEY']);

const { db, admin } = require('../src/config/firebaseAdmin');
const { escopoDe } = require('../src/data/escopo');
const { criarConsultaFinanceira } = require('../src/services/consultaFinanceiraService');
const { criarChatIA, chamarModeloReal } = require('../src/services/chatIAService');
const { criarChatSessionService } = require('../src/services/chatSessionService');
const { parseWithAI } = require('../src/services/aiParserService');
const transactionService = require('../src/services/transactionService');
const categoryService = require('../src/services/categoryService');
const subcategoryService = require('../src/services/subcategoryService');
const budgetService = require('../src/services/budgetService');
const recurringBillService = require('../src/services/recurringBillService');

const FAMILIA = `custo-${Date.now()}`;
const MENSALIDADE = 24.90;
const COTA_DIARIA = 20;

/**
 * Perguntas de verdade, do teste ao vivo do Kirk em 18/08/2026 — não
 * perguntas inventadas para o benchmark ficar bonito. Variam de propósito
 * entre consulta simples e conselho, que é o que custa mais.
 */
const PERGUNTAS = [
  'Quanto gastei no mercado ?',
  'Me traga detalhes sobre moradia',
  'Que dia foi feito o lançamento da geladeira ?',
  'Como posso fazer para pagar isso de forma mais rápida ?',
  'Some somente o que gastei essencial no mês para ver quanto gastei de fato',
];

function mesCorrente() {
  const a = new Date();
  return `${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function plantarDados() {
  const dados = escopoDe(FAMILIA);

  const mercado = await dados.criar('categories', { name: 'Mercado', type: 'EXPENSE', color: '#22c55e' });
  const moradia = await dados.criar('categories', { name: 'Moradia', type: 'EXPENSE', color: '#f59e0b' });
  const casa = await dados.criar('categories', { name: 'Casa', type: 'EXPENSE', color: '#8b5cf6' });
  const pix = await dados.criar('paymentMethods', { name: 'Pix' });

  const mes = mesCorrente();
  const lancar = async (desc, valor, cat, quem) => {
    await dados.criar('transactions', {
      type: 'EXPENSE',
      description: desc,
      amount: valor,
      categoryId: cat,
      subcategoryId: null,
      paymentMethodId: pix.id,
      date: admin.firestore.Timestamp.fromDate(new Date(`${mes}-10T12:00:00Z`)),
      referenceMonth: mes,
      status: 'CONFIRMED',
      origin: 'MANUAL',
      paidBy: quem,
    });
  };

  await lancar('compra do mês', 480, mercado.id, 'Kirk');
  await lancar('feira', 95, mercado.id, 'Raquel');
  await lancar('aluguel', 1400, moradia.id, 'Kirk');
  await lancar('condomínio', 380, moradia.id, 'Kirk');
  await lancar('geladeira nova', 2200, casa.id, 'Raquel');

  return mes;
}

async function apagarTudo() {
  const colecoes = ['transactions', 'categories', 'subcategories', 'paymentMethods', 'chatSessions'];
  for (const colecao of colecoes) {
    const snap = await db.collection(colecao).where('householdId', '==', FAMILIA).get();
    if (!snap.size) continue;
    const lote = db.batch();
    snap.docs.forEach((d) => lote.delete(d.ref));
    await lote.commit();
  }
  await db.collection('households').doc(FAMILIA).delete().catch(() => {});
}

async function principal() {
  console.log('\n=== CUSTO REAL DA ASSISTENTE — medido contra o Gemini de verdade ===');
  console.log(`Família descartável: ${FAMILIA}\n`);

  await db.collection('households').doc(FAMILIA).set({
    name: 'Família do custo',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const mes = await plantarDados();
  console.log(`Dados plantados em ${mes}. Rodando ${PERGUNTAS.length} perguntas...\n`);

  const consulta = criarConsultaFinanceira({
    transactionService, categoryService, subcategoryService, budgetService, recurringBillService,
  });
  const sessoes = criarChatSessionService();
  const ia = criarChatIA({ consulta, sessoes, chamarModelo: chamarModeloReal });
  const dados = escopoDe(FAMILIA);

  const linhas = [];

  for (const pergunta of PERGUNTAS) {
    // Interlocutor diferente a cada pergunta: sem isso a memória de conversa
    // acumula e a entrada cresce por um motivo que não é o que se quer medir.
    const interlocutor = `medicao-${linhas.length}`;

    const t0 = Date.now();
    const r = await ia.responder({
      dados,
      pergunta,
      interlocutor,
      permissoes: { lancar: true },
      nomeDaIA: 'Nina',
      canal: 'WHATSAPP',
    });
    const segundos = (Date.now() - t0) / 1000;

    // A chamada EXTRA que só a pergunta sem o nome paga: o parser tentando
    // interpretar a pergunta como lançamento antes de desistir. O consumo dela
    // sai no log do [AI Parser], logo acima desta linha.
    const t1 = Date.now();
    const parsed = await parseWithAI(pergunta, ['Kirk', 'Raquel']);
    const segundosParser = (Date.now() - t1) / 1000;

    linhas.push({
      pergunta,
      uso: r.uso,
      segundos,
      segundosParser,
      ferramentas: (r.ferramentasUsadas || []).length,
      intencao: parsed?.intencao || '(nulo)',
      erro: r.erro || null,
    });

    console.log(`--- "${pergunta.slice(0, 60)}"`);
    console.log(`    intenção que o parser deu: ${parsed?.intencao || '(nulo)'}`);
    console.log(`    chamadas=${r.uso.chamadasAoModelo} ferramentas=${(r.ferramentasUsadas || []).length}`
      + ` entrada=${r.uso.entrada} saída=${r.uso.saida} (pensamento=${r.uso.pensamento})`);
    console.log(`    custo da assistente = R$ ${r.uso.custoBRL.toFixed(4)} em ${segundos.toFixed(1)}s`);
    if (r.erro) console.log(`    ERRO: ${r.erro}`);
    console.log(`    resposta: ${(r.texto || '').slice(0, 90).replace(/\n/g, ' ')}...`);
    console.log('');
  }

  const n = linhas.length;
  const soma = (f) => linhas.reduce((a, l) => a + f(l), 0);

  const custoMedio = soma((l) => l.uso.custoBRL) / n;
  const entradaMedia = soma((l) => l.uso.entrada) / n;
  const saidaMedia = soma((l) => l.uso.saida) / n;
  const pensamentoMedio = soma((l) => l.uso.pensamento) / n;
  const chamadasMedia = soma((l) => l.uso.chamadasAoModelo) / n;
  const tempoMedio = soma((l) => l.segundos) / n;
  const tempoParser = soma((l) => l.segundosParser) / n;

  console.log('==================== RESUMO ====================');
  console.log(`Perguntas medidas: ${n}`);
  console.log('Média por pergunta:');
  console.log(`  chamadas ao modelo : ${chamadasMedia.toFixed(1)}`);
  console.log(`  tokens de entrada  : ${Math.round(entradaMedia)}`);
  console.log(`  tokens de saída    : ${Math.round(saidaMedia)} (raciocínio: ${Math.round(pensamentoMedio)})`);
  console.log(`  tempo de resposta  : ${tempoMedio.toFixed(1)}s (+ ${tempoParser.toFixed(1)}s quando vem sem o nome)`);
  console.log(`  CUSTO              : R$ ${custoMedio.toFixed(4)}`);
  console.log('');

  const porDia = custoMedio * COTA_DIARIA;
  const porMes = porDia * 30;

  console.log(`Cota atual: ${COTA_DIARIA} conversas/dia.`);
  console.log(`  pior caso por família : R$ ${porDia.toFixed(2)}/dia = R$ ${porMes.toFixed(2)}/mês`);
  console.log(`  mensalidade           : R$ ${MENSALIDADE.toFixed(2)}`);

  if (porMes > MENSALIDADE) {
    const cotaSegura = Math.floor((MENSALIDADE * 0.20) / (custoMedio * 30));
    console.log('\n  ATENÇÃO: no limite a IA custa MAIS que a mensalidade.');
    console.log('  Para a IA ficar em ~20% da receita, a cota teria de cair para');
    console.log(`  ~${cotaSegura} conversas/dia.`);
  } else {
    const fatia = (porMes / MENSALIDADE) * 100;
    console.log(`\n  No limite a IA come ${fatia.toFixed(1)}% da mensalidade.`);
    console.log('  (o uso real fica muito abaixo do teto — quase ninguém faz 20 perguntas/dia)');
  }

  console.log('\nO que importa é o uso médio, não o teto. Com 3 perguntas/dia,');
  console.log(`o custo fica em R$ ${(custoMedio * 3 * 30).toFixed(2)}/mês por família.`);
  console.log('===============================================\n');

  await apagarTudo();
  console.log('Família de teste apagada.\n');
}

principal().then(() => process.exit(0)).catch(async (err) => {
  console.error('\nFalhou:', err.message);
  console.error(err.stack);
  await apagarTudo().catch(() => {});
  process.exit(1);
});
