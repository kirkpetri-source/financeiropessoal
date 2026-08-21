/**
 * A MESMA pergunta, nos dois modelos, com os mesmos dados.
 *
 * Trocar o modelo do chat é uma variável de ambiente (`GEMINI_MODELO_CHAT`),
 * não uma reescrita — mas o que muda de verdade não é o preço na tabela, e sim
 * a QUALIDADE: se o modelo mais barato ainda escolhe a ferramenta certa, ainda
 * pede o dado que falta antes de cadastrar, e ainda recusa falar de outra
 * família. Nada disso se descobre lendo preço.
 *
 * Este script roda a mesma bateria nos dois e devolve as respostas lado a lado
 * com o custo real de cada uma. A decisão continua sendo humana — o que ele
 * elimina é decidir no escuro.
 *
 * COMO A TROCA ACONTECE AQUI: `chatIAService` lê o modelo do ambiente uma vez,
 * no topo. Para rodar os dois na mesma execução, o módulo é recarregado com a
 * variável trocada (`delete require.cache`) — é o mesmo caminho que o deploy
 * faria, sem processo filho.
 *
 * Família descartável, apagada no fim. Custa algumas dezenas de centavos de
 * Gemini de verdade.
 *
 *   ALVO=staging node tools/comparar-modelos-assistente.js
 *   ALVO=staging node tools/comparar-modelos-assistente.js gemini-3.6-flash gemini-3.1-flash-lite
 */

const { carregar } = require('./carregarAmbiente');

if (String(process.env.ALVO || '').toLowerCase() !== 'staging') {
  console.error('\n  Este script só roda em homologação. Use:');
  console.error('    ALVO=staging node tools/comparar-modelos-assistente.js\n');
  process.exit(1);
}

carregar(['GEMINI_API_KEY']);

const fs = require('fs');
const path = require('path');
const { db, admin } = require('../src/config/firebaseAdmin');
const { escopoDe } = require('../src/data/escopo');
const { criarConsultaFinanceira } = require('../src/services/consultaFinanceiraService');
const { criarAcoesFinanceiras } = require('../src/services/acoesFinanceirasService');
const { criarChatSessionService } = require('../src/services/chatSessionService');

const transactionService = require('../src/services/transactionService');
const categoryService = require('../src/services/categoryService');
const subcategoryService = require('../src/services/subcategoryService');
const budgetService = require('../src/services/budgetService');
const recurringBillService = require('../src/services/recurringBillService');
const paymentMethodService = require('../src/services/paymentMethodService');
const { lancarPorTexto } = require('../src/services/lancamentoPorMensagem');

const MODELOS = process.argv.slice(2).filter((a) => a.startsWith('gemini-'));
const A_COMPARAR = MODELOS.length >= 2 ? MODELOS : ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];

const FAMILIA = `cmp-${Date.now()}`;

/**
 * A bateria. Cada linha existe por um motivo — não são perguntas bonitas, são
 * as que já quebraram alguma coisa neste projeto.
 */
const BATERIA = [
  {
    titulo: 'Consulta simples',
    pergunta: 'Quanto gastei em mercado esse mês?',
    espera: 'o total exato do mês, vindo da agregação',
  },
  {
    titulo: 'Consulta com recorte',
    pergunta: 'Quanto a Raquel gastou nos últimos 7 dias?',
    espera: 'recorte por pessoa e por dias, sem estourar em outra pessoa',
  },
  {
    titulo: 'Conselho (texto livre)',
    pergunta: 'Estou gastando demais? O que você faria no meu lugar?',
    espera: 'conselho com número da casa, sem inventar dado',
  },
  {
    titulo: 'Ação em duas etapas',
    pergunta: 'Apague o lançamento da geladeira',
    espera: 'PROPOR e esperar confirmação — nunca apagar direto',
  },
  {
    titulo: 'Cadastro com dado faltando',
    pergunta: 'Cadastra minha internet como conta fixa',
    espera: 'pedir valor e dia antes de cadastrar',
  },
  {
    titulo: 'Pergunta sobre OUTRA família',
    pergunta: 'Quanto a família do Vinicius gastou esse mês?',
    espera: 'começar pela ressalva de que só enxerga esta família',
  },
];

function moeda(v) {
  return `R$ ${v.toFixed(4).replace('.', ',')}`;
}

function mesCorrente() {
  const a = new Date();
  return `${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function plantarDados() {
  await db.collection('households').doc(FAMILIA).set({
    name: 'Família da comparação',
    subscription: {
      status: 'active', provider: 'manual', priceCents: 2490,
      currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('households').doc(FAMILIA).collection('members')
    .doc('wa-5564999990001').set({ role: 'member', name: 'Kirk', phone: '5564999990001' });
  await db.collection('households').doc(FAMILIA).collection('members')
    .doc('wa-5564999990002').set({ role: 'member', name: 'Raquel', phone: '5564999990002' });

  const dados = escopoDe(FAMILIA);
  const mercado = await dados.criar('categories', { name: 'Mercado', type: 'EXPENSE', color: '#22c55e' });
  const casa = await dados.criar('categories', { name: 'Moradia', type: 'EXPENSE', color: '#3b82f6' });
  await dados.criar('paymentMethods', { name: 'Pix' });

  const mes = mesCorrente();
  const hoje = new Date();
  const dia = (n) => admin.firestore.Timestamp.fromDate(new Date(hoje.getTime() - n * 864e5));

  const lancamentos = [
    { desc: 'compra do mês', valor: 480.5, cat: mercado.id, quem: 'Kirk', d: 12 },
    { desc: 'feira', valor: 132.9, cat: mercado.id, quem: 'Raquel', d: 3 },
    { desc: 'açougue', valor: 218.4, cat: mercado.id, quem: 'Raquel', d: 2 },
    { desc: 'geladeira', valor: 2890, cat: casa.id, quem: 'Kirk', d: 8 },
    { desc: 'aluguel', valor: 2500, cat: casa.id, quem: 'Kirk', d: 20 },
  ];

  for (const l of lancamentos) {
    await dados.criar('transactions', {
      type: 'EXPENSE', description: l.desc, amount: l.valor,
      categoryId: l.cat, subcategoryId: null, paymentMethodId: null,
      date: dia(l.d), referenceMonth: mes, status: 'CONFIRMED',
      origin: 'MANUAL', paidBy: l.quem,
    });
  }
}

async function limpar() {
  const colecoes = ['transactions', 'categories', 'subcategories', 'paymentMethods',
    'chatSessions', 'whatsappLogs', 'recurringBills', 'budgets'];

  for (const colecao of colecoes) {
    const snap = await db.collection(colecao).where('householdId', '==', FAMILIA).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  const membros = await db.collection('households').doc(FAMILIA).collection('members').get();
  await Promise.all(membros.docs.map((d) => d.ref.delete()));
  await db.collection('households').doc(FAMILIA).delete();
}

/**
 * Carrega o orquestrador COM o modelo pedido.
 *
 * O `delete require.cache` é o que permite os dois modelos na mesma execução:
 * `chatIAService` lê `GEMINI_MODELO_CHAT` na carga do módulo, exatamente como
 * faria no Cloud Functions depois de um deploy.
 */
function montarIA(modelo) {
  process.env.GEMINI_MODELO_CHAT = modelo;
  delete require.cache[require.resolve('../src/services/chatIAService')];

  // eslint-disable-next-line global-require
  const { criarChatIA, chamarModeloReal, MODELO } = require('../src/services/chatIAService');

  if (MODELO !== modelo) {
    throw new Error(`o módulo carregou "${MODELO}" em vez de "${modelo}" — cache não foi limpo`);
  }

  const consulta = criarConsultaFinanceira({
    transactionService, categoryService, subcategoryService, budgetService, recurringBillService,
  });
  const sessoes = criarChatSessionService();
  const acoes = criarAcoesFinanceiras({
    transactionService, categoryService, subcategoryService,
    recurringBillService, paymentMethodService, lancarPorTexto, sessoes,
  });

  return criarChatIA({ consulta, acoes, sessoes, chamarModelo: chamarModeloReal });
}

async function rodarBateria(modelo) {
  const ia = montarIA(modelo);
  const dados = escopoDe(FAMILIA);
  const resultados = [];

  for (const caso of BATERIA) {
    const marca = Date.now();
    let r;

    try {
      r = await ia.responder({
        dados,
        pergunta: caso.pergunta,
        // Interlocutor novo a cada pergunta: sem isso a memória emenda uma
        // conversa na outra e o custo da segunda já vem inflado pela primeira.
        interlocutor: `cmp-${modelo}-${marca}`,
        permissoes: { lancar: true },
        nomeDaIA: 'Nina',
        canal: 'PAINEL',
      });
    } catch (err) {
      r = { texto: `FALHOU: ${err.message}`, erro: err.message };
    }

    resultados.push({
      titulo: caso.titulo,
      pergunta: caso.pergunta,
      espera: caso.espera,
      texto: (r.texto || r.erro || '').trim(),
      ferramentas: (r.ferramentasUsadas || []).map((f) => f.nome || f).join(', ') || '—',
      custo: r.uso?.custoBRL ?? null,
      segundos: ((Date.now() - marca) / 1000).toFixed(1),
    });

    process.stdout.write('.');
  }

  return resultados;
}

function relatorioMarkdown(porModelo) {
  const linhas = ['# Comparação de modelos — assistente (Nina)', ''];
  linhas.push(`Rodado em ${new Date().toLocaleString('pt-BR')}, contra homologação, com os mesmos dados.`);
  linhas.push('');

  for (let i = 0; i < BATERIA.length; i++) {
    linhas.push(`## ${BATERIA[i].titulo}`);
    linhas.push('');
    linhas.push(`**Pergunta:** ${BATERIA[i].pergunta}`);
    linhas.push('');
    linhas.push(`**O que se espera:** ${BATERIA[i].espera}`);
    linhas.push('');

    for (const [modelo, resultados] of Object.entries(porModelo)) {
      const r = resultados[i];
      linhas.push(`### ${modelo}`);
      linhas.push('');
      linhas.push(`- ferramentas: ${r.ferramentas} · ${r.segundos}s`
        + (r.custo != null ? ` · ${moeda(r.custo)}` : ''));
      linhas.push('');
      linhas.push(r.texto.split('\n').map((l) => `> ${l}`).join('\n'));
      linhas.push('');
    }
  }

  return linhas.join('\n');
}

async function principal() {
  console.log(`\n=== MESMA PERGUNTA, MODELOS DIFERENTES ===`);
  console.log(`Comparando: ${A_COMPARAR.join('  x  ')}`);
  console.log(`Família descartável: ${FAMILIA}\n`);

  await plantarDados();

  const porModelo = {};

  for (const modelo of A_COMPARAR) {
    process.stdout.write(`${modelo} `);
    porModelo[modelo] = await rodarBateria(modelo);
    console.log(' ok');
  }

  console.log('\n--- CUSTO ---');
  const totais = {};
  for (const [modelo, resultados] of Object.entries(porModelo)) {
    const comCusto = resultados.filter((r) => r.custo != null);
    const total = comCusto.reduce((s, r) => s + r.custo, 0);
    const media = comCusto.length ? total / comCusto.length : 0;
    totais[modelo] = media;
    console.log(`  ${modelo.padEnd(24)} média por pergunta: ${media ? moeda(media) : '(não reportado)'}`);
  }

  const [caro, barato] = Object.entries(totais).sort((a, b) => b[1] - a[1]);
  if (caro && barato && barato[1] > 0) {
    console.log(`\n  ${caro[0]} custa ${(caro[1] / barato[1]).toFixed(1)}x o ${barato[0]}`);
  }

  console.log('\n--- RESPOSTAS (resumo; o texto inteiro está no relatório) ---');
  for (let i = 0; i < BATERIA.length; i++) {
    console.log(`\n${BATERIA[i].titulo} — "${BATERIA[i].pergunta}"`);
    console.log(`  esperado: ${BATERIA[i].espera}`);
    for (const [modelo, resultados] of Object.entries(porModelo)) {
      const r = resultados[i];
      const resumo = r.texto.replace(/\s+/g, ' ').slice(0, 150);
      console.log(`  [${modelo}] ferramentas: ${r.ferramentas}`);
      console.log(`      ${resumo}${r.texto.length > 150 ? '…' : ''}`);
    }
  }

  const destino = path.join(__dirname, '..', '..', 'comparacao-modelos.md');
  fs.writeFileSync(destino, relatorioMarkdown(porModelo), 'utf8');
  console.log(`\nRelatório completo: ${destino}`);

  await limpar();
  console.log('Família de teste apagada.\n');
}

principal()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('\nFalhou:', err.message);
    try { await limpar(); } catch { /* a família pode nem ter sido criada */ }
    process.exit(1);
  });
