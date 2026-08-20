/**
 * O ciclo completo de criar subcategoria sob demanda, contra o Firestore real.
 *
 * O que ele prova, do começo ao fim:
 *   1. o primeiro lançamento de uma descrição nova NÃO incomoda ninguém
 *   2. na segunda vez, o sistema oferece criar
 *   3. aceitar cria a subcategoria E marca o lançamento que motivou a oferta
 *   4. o TERCEIRO lançamento vai direto, sem perguntar nada
 *   5. "não" cala a sugestão para sempre
 *
 * O passo 4 é o que justifica a feature existir — sem ele a pessoa organiza
 * uma vez e continua lançando errado.
 *
 *   ALVO=staging node tools/testar-criar-subcategoria.js
 */

const { carregar } = require('./carregarAmbiente');

if (String(process.env.ALVO || '').toLowerCase() !== 'staging') {
  console.error('\n  Este script só roda em homologação. Use:');
  console.error('    ALVO=staging node tools/testar-criar-subcategoria.js\n');
  process.exit(1);
}

carregar(['GEMINI_API_KEY']);

const { db, admin } = require('../src/config/firebaseAdmin');
const { escopoDe } = require('../src/data/escopo');
const {
  lancarPorTexto, tentarResolverConfirmacaoPendente,
} = require('../src/services/lancamentoPorMensagem');

const FAMILIA = `criarsub-${Date.now()}`;
const TELEFONE = '5564999990001';
const JID = `${TELEFONE}@s.whatsapp.net`;

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
    name: 'Família da criação',
    subscription: {
      status: 'active', provider: 'manual', priceCents: 2490,
      currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('households').doc(FAMILIA).collection('members')
    .doc(`wa-${TELEFONE}`).set({ role: 'member', name: 'Kirk', phone: TELEFONE });

  const dados = escopoDe(FAMILIA);
  await dados.criar('categories', { name: 'Outros', type: 'EXPENSE', color: '#94a3b8' });
  await dados.criar('categories', { name: 'Casa', type: 'EXPENSE', color: '#8b5cf6' });
  await dados.criar('paymentMethods', { name: 'Pix' });
}

async function limpar() {
  const colecoes = ['transactions', 'categories', 'subcategories', 'paymentMethods',
    'pendingSubcategoryConfirmations', 'whatsappLogs', 'chatSessions', 'memoriaDeDescricao'];
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

async function lancar(texto) {
  const r = await lancarPorTexto({
    householdId: FAMILIA,
    texto,
    senderJid: JID,
    pushName: 'Kirk',
    dataDaMensagem: new Date().toISOString(),
    origem: 'chat privado',
  });

  if (!r.transacoes.length) return { erro: r.erro, oferta: r.perguntaSubcategoria };

  const doc = await db.collection('transactions').doc(r.transacoes[0]).get();
  const t = doc.data();
  const sub = t.subcategoryId
    ? (await db.collection('subcategories').doc(t.subcategoryId).get()).data() : null;
  const cat = t.categoryId
    ? (await db.collection('categories').doc(t.categoryId).get()).data() : null;

  return {
    id: r.transacoes[0],
    categoria: cat?.name || null,
    subcategoria: sub?.name || null,
    oferta: r.perguntaSubcategoria || null,
  };
}

const responder = (texto) => tentarResolverConfirmacaoPendente({
  householdId: FAMILIA, senderJid: JID, texto,
});

async function principal() {
  console.log('\n=== CRIAR SUBCATEGORIA SOB DEMANDA ===');
  console.log(`Família descartável: ${FAMILIA}\n`);

  await montar();

  // 1. Primeira vez: silêncio.
  console.log('1. Primeira vez que a descrição aparece — não incomoda');
  const um = await lancar('gastei 29,90 ração cachorro');
  console.log(`   -> ${um.categoria} / ${um.subcategoria || 'sem subcategoria'}`);
  checar('lançou normalmente', !!um.categoria, `erro: ${um.erro}`);
  checar('NÃO ofereceu nada na primeira vez', !um.oferta,
    um.oferta ? 'ofereceu cedo demais' : '');

  // 2. Segunda vez: oferece.
  console.log('\n2. Segunda vez — oferece criar');
  const dois = await lancar('gastei 32 ração cachorro');
  console.log(`   -> ${dois.categoria} / ${dois.subcategoria || 'sem subcategoria'}`);
  checar('ofereceu criar', !!dois.oferta, 'não ofereceu');
  if (dois.oferta) {
    console.log(`   -> a pessoa lê:\n${dois.oferta.split('\n').map((l) => `        ${l}`).join('\n')}`);
    checar('a oferta propõe o nome "Ração"', dois.oferta.includes('Ração'));
    checar('a oferta diz quantas vezes apareceu', dois.oferta.includes('2x'));
  }

  // 3. A pessoa escolhe outro nome E outra categoria.
  console.log('\n3. Responde "Pet em Casa" — muda nome e categoria');
  const criou = await responder('Pet em Casa');
  checar('a resposta foi tratada', criou.tratado, 'não tratou');
  if (criou.tratado) {
    console.log(`   -> a pessoa lê:\n${criou.resposta.split('\n').map((l) => `        ${l}`).join('\n')}`);
    checar('confirmou a criação', criou.resposta.includes('Criei'));
    checar('avisa sobre escrever diferente',
      criou.resposta.toLowerCase().includes('diferente'));
  }

  const dados = escopoDe(FAMILIA);
  const subs = await dados.consultar('subcategories').get();
  const criada = subs.docs.map((d) => ({ id: d.id, ...d.data() }))
    .find((s) => s.name === 'Pet');
  checar('a subcategoria Pet existe agora', !!criada, 'não foi criada');

  if (criada) {
    const mae = await db.collection('categories').doc(criada.categoryId).get();
    checar('nasceu em Casa, e não em Outros', mae.data()?.name === 'Casa',
      `nasceu em ${mae.data()?.name}`);
  }

  // O lançamento que motivou a oferta também precisa ser marcado.
  const marcado = await db.collection('transactions').doc(dois.id).get();
  checar('o lançamento que gerou a oferta foi marcado',
    marcado.data()?.subcategoryId === criada?.id,
    `subcategoryId=${marcado.data()?.subcategoryId}`);

  // 4. O QUE JUSTIFICA A FEATURE: o próximo vai direto.
  console.log('\n4. Terceira vez — tem que ir direto, sem perguntar');
  const tres = await lancar('gastei 28 ração cachorro');
  console.log(`   -> ${tres.categoria} / ${tres.subcategoria || 'sem subcategoria'}`);
  checar('foi direto para Pet', tres.subcategoria === 'Pet',
    `foi para ${tres.subcategoria}`);
  checar('foi para a categoria Casa', tres.categoria === 'Casa',
    `foi para ${tres.categoria}`);
  checar('NÃO perguntou nada', !tres.oferta, 'perguntou de novo');

  // 5. Recusa é definitiva.
  console.log('\n5. "não" cala a sugestão para sempre');
  await lancar('gastei 15 pizza sexta');
  const pizza2 = await lancar('gastei 18 pizza sexta');
  checar('ofereceu na segunda vez', !!pizza2.oferta, 'não ofereceu');

  const recusou = await responder('não');
  checar('a recusa foi tratada', recusou.tratado);
  if (recusou.tratado) console.log(`   -> a pessoa lê: "${recusou.resposta}"`);

  const pizza3 = await lancar('gastei 20 pizza sexta');
  checar('NÃO ofereceu de novo depois do não', !pizza3.oferta,
    'voltou a oferecer mesmo depois da recusa');

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
