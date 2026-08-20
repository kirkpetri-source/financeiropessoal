/**
 * Lançar direto numa SUBCATEGORIA funciona?
 *
 * O relato de produção (20/08/2026): "sempre que o cliente lança para uma
 * subcategoria, o lançamento vai para Outros, como se o sistema não
 * conseguisse vê-las".
 *
 * A suspeita: o parser resolve CATEGORIA, e nunca recebe a lista de
 * subcategorias da família. "gastei 45 na padaria" não casa com nenhuma
 * categoria conhecida e cai no genérico, porque "Padaria" existe só como
 * subcategoria de Mercado.
 *
 * Este script prova ou desmente isso contra o Firestore e o Gemini reais, e
 * depois vira a rede de proteção da correção.
 *
 * O que se espera ao final:
 *   - "gastei 45 na padaria"   -> Mercado > Padaria, SEM perguntar
 *   - "gastei 45 no mercado"   -> Mercado, SEM perguntar (a pessoa foi clara)
 *   - "gastei 45 numa parada"  -> pergunta, listando as subcategorias
 *
 *   ALVO=staging node tools/testar-lancamento-subcategoria.js
 */

const { carregar } = require('./carregarAmbiente');

if (String(process.env.ALVO || '').toLowerCase() !== 'staging') {
  console.error('\n  Este script só roda em homologação. Use:');
  console.error('    ALVO=staging node tools/testar-lancamento-subcategoria.js\n');
  process.exit(1);
}

carregar(['GEMINI_API_KEY']);

const { db, admin } = require('../src/config/firebaseAdmin');
const { escopoDe } = require('../src/data/escopo');
const { lancarPorTexto } = require('../src/services/lancamentoPorMensagem');

const FAMILIA = `subcat-${Date.now()}`;
const TELEFONE = '5564999990001';

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
    name: 'Família da subcategoria',
    subscription: {
      status: 'active', provider: 'manual', priceCents: 2490,
      currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('households').doc(FAMILIA).collection('members')
    .doc(`wa-${TELEFONE}`).set({ role: 'member', name: 'Kirk', phone: TELEFONE });

  const dados = escopoDe(FAMILIA);

  const mercado = await dados.criar('categories', { name: 'Mercado', type: 'EXPENSE', color: '#22c55e' });
  const saude = await dados.criar('categories', { name: 'Saúde', type: 'EXPENSE', color: '#ef4444' });
  await dados.criar('categories', { name: 'Outros', type: 'EXPENSE', color: '#94a3b8' });
  await dados.criar('paymentMethods', { name: 'Pix' });

  const padaria = await dados.criar('subcategories', { name: 'Padaria', categoryId: mercado.id });
  const acougue = await dados.criar('subcategories', { name: 'Açougue', categoryId: mercado.id });
  const hortifruti = await dados.criar('subcategories', { name: 'Hortifruti', categoryId: mercado.id });
  const academia = await dados.criar('subcategories', { name: 'Academia', categoryId: saude.id });

  return {
    mercadoId: mercado.id,
    saudeId: saude.id,
    padariaId: padaria.id,
    acougueId: acougue.id,
    hortifrutiId: hortifruti.id,
    academiaId: academia.id,
  };
}

async function limpar() {
  const colecoes = ['transactions', 'categories', 'subcategories', 'paymentMethods',
    'pendingSubcategoryConfirmations', 'whatsappLogs', 'chatSessions'];
  for (const c of colecoes) {
    const snap = await db.collection(c).where('householdId', '==', FAMILIA).get();
    if (!snap.size) continue;
    const lote = db.batch();
    snap.docs.forEach((d) => lote.delete(d.ref));
    await lote.commit();
  }
  const membros = await db.collection('households').doc(FAMILIA).collection('members').get();
  for (const m of membros.docs) await m.ref.delete();
  await db.collection('households').doc(FAMILIA).delete().catch(() => {});
}

/** Lança e devolve a transação criada, já com os nomes resolvidos. */
async function lancar(texto) {
  const r = await lancarPorTexto({
    householdId: FAMILIA,
    texto,
    senderJid: `${TELEFONE}@s.whatsapp.net`,
    pushName: 'Kirk',
    dataDaMensagem: new Date().toISOString(),
    origem: 'chat privado',
  });

  if (!r.transacoes.length) return { erro: r.erro, perguntou: r.perguntaSubcategoria };

  // A confirmação que a pessoa REALMENTE lê no WhatsApp — registrar certo e
  // informar errado é, para quem lê, a mesma coisa que errar.
  const { montarConfirmacaoMultipla } = require('../src/services/respostaTexto');
  const confirmacao = montarConfirmacaoMultipla(null, r.criadas);

  const doc = await db.collection('transactions').doc(r.transacoes[0]).get();
  const t = doc.data();

  const cat = t.categoryId ? (await db.collection('categories').doc(t.categoryId).get()).data() : null;
  const sub = t.subcategoryId
    ? (await db.collection('subcategories').doc(t.subcategoryId).get()).data() : null;

  return {
    categoria: cat?.name || null,
    subcategoria: sub?.name || null,
    valor: t.amount,
    perguntou: r.perguntaSubcategoria || null,
    confirmacao,
  };
}

async function principal() {
  console.log('\n=== LANÇAMENTO DIRETO EM SUBCATEGORIA ===');
  console.log(`Família descartável: ${FAMILIA}\n`);

  await montar();

  // 1. O BUG RELATADO: subcategoria citada pelo nome.
  console.log('1. A pessoa cita a SUBCATEGORIA pelo nome');

  const padaria = await lancar('gastei 45 na padaria');
  console.log(`   -> categoria=${padaria.categoria} subcategoria=${padaria.subcategoria}`);
  console.log(`   -> a pessoa lê: "${padaria.confirmacao}"`);
  checar('a confirmação DIZ a subcategoria',
    (padaria.confirmacao || '').includes('Padaria'),
    `a mensagem foi "${padaria.confirmacao}"`);
  checar('caiu em Mercado (e não em Outros)', padaria.categoria === 'Mercado',
    `caiu em ${padaria.categoria}`);
  checar('marcou a subcategoria Padaria', padaria.subcategoria === 'Padaria',
    `subcategoria=${padaria.subcategoria}`);
  checar('NÃO perguntou nada', !padaria.perguntou,
    padaria.perguntou ? 'perguntou mesmo com a subcategoria explícita' : '');

  const acougue = await lancar('paguei 120 no açougue');
  console.log(`   -> categoria=${acougue.categoria} subcategoria=${acougue.subcategoria}`);
  checar('açougue vai para Mercado > Açougue',
    acougue.categoria === 'Mercado' && acougue.subcategoria === 'Açougue',
    `${acougue.categoria} > ${acougue.subcategoria}`);

  const academia = await lancar('gastei 59,90 na academia');
  console.log(`   -> categoria=${academia.categoria} subcategoria=${academia.subcategoria}`);
  checar('academia vai para Saúde > Academia',
    academia.categoria === 'Saúde' && academia.subcategoria === 'Academia',
    `${academia.categoria} > ${academia.subcategoria}`);

  // 2. Categoria citada explicitamente: não perguntar.
  console.log('\n2. A pessoa cita a CATEGORIA — não é para perguntar');

  const mercado = await lancar('gastei 80 no mercado');
  console.log(`   -> categoria=${mercado.categoria} subcategoria=${mercado.subcategoria}`);
  console.log(`   -> a pessoa lê: "${mercado.confirmacao}"`);
  checar('caiu em Mercado', mercado.categoria === 'Mercado', `caiu em ${mercado.categoria}`);
  checar('NÃO perguntou a subcategoria', !mercado.perguntou,
    mercado.perguntou ? 'perguntou apesar de a categoria ser explícita' : '');

  // 3. Nada reconhecível: aí sim pergunta.
  console.log('\n3. Sem categoria nem subcategoria clara — aí pergunta');

  const vago = await lancar('gastei 33 numa parada qualquer ali');
  console.log(`   -> categoria=${vago.categoria} subcategoria=${vago.subcategoria}`
    + ` perguntou=${vago.perguntou ? 'sim' : 'não'}`);
  checar('registrou o lançamento mesmo assim', !!vago.categoria, 'não criou');

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
