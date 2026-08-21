/**
 * Áudio agora pergunta, e não só lança.
 *
 * Até 20/08/2026 o áudio era o único canal onde perguntar não funcionava: o
 * webhook tratava todo áudio como tentativa de lançamento, então gravar
 * "Nina, quanto gastei em mercado?" devolvia "Não entendi..." com a lição de
 * como escrever um gasto. Foi visto ao vivo quando um áudio pedindo alteração
 * de categoria virou erro.
 *
 * Este script prova os três caminhos com o webhook DE VERDADE, sem WhatsApp no
 * meio. O envio da resposta falha de propósito (URL da Evolution inválida em
 * homologação) e `responder()` engole a falha, então tudo que importa no banco
 * acontece igual.
 *
 * A transcrição é dublada: gerar áudio de verdade exigiria síntese de voz e
 * tornaria o teste caro e frágil. O que se testa aqui é o ROTEAMENTO depois da
 * transcrição, que é onde estava o problema.
 *
 *   ALVO=staging node tools/testar-audio-assistente.js
 */

const { carregar } = require('./carregarAmbiente');

if (String(process.env.ALVO || '').toLowerCase() !== 'staging') {
  console.error('\n  Este script só roda em homologação. Use:');
  console.error('    ALVO=staging node tools/testar-audio-assistente.js\n');
  process.exit(1);
}

carregar(['GEMINI_API_KEY']);

const path = require('path');
const { db, admin } = require('../src/config/firebaseAdmin');
const { escopoDe } = require('../src/data/escopo');

const FAMILIA = `audio-${Date.now()}`;
const GRUPO = `${Date.now()}-audio@g.us`;
const INSTANCIA = `fam-${FAMILIA}`;
const PARTICIPANTE = '5564999990001@s.whatsapp.net';

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

/**
 * Dubla a transcrição e o download da mídia.
 *
 * Feito ANTES de o webhook ser carregado, porque ele resolve os módulos no
 * topo. Não é mock de módulo do vitest (proibido pela regra 2) — é troca de
 * propriedade no objeto já exportado, e só nestes dois pontos de I/O externo.
 */
let falaAtual = '';

function dublarEntradas() {
  const midia = require('../src/services/midiaParserService');
  midia.transcreverAudio = async () => ({ texto: falaAtual, erro: null });

  const canais = require('../src/canais');
  const provedorOriginal = canais.provedorDe;
  canais.provedorDe = (config) => ({
    ...provedorOriginal(config),
    baixarMidia: async () => ({ base64: 'ZmFrZQ==', mimetype: 'audio/ogg' }),
  });
}

dublarEntradas();

const { processarMensagemRecebida } = require('../src/webhooks/evolutionWebhook');

function payloadDeAudio(messageId) {
  return {
    body: {
      instance: INSTANCIA,
      data: {
        key: { id: messageId, remoteJid: GRUPO, fromMe: false, participant: PARTICIPANTE },
        message: { audioMessage: { seconds: 3 } },
        pushName: 'Kirk',
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    },
  };
}

async function logsDe(messageId) {
  const snap = await db.collection('whatsappLogs')
    .where('householdId', '==', FAMILIA)
    .where('messageId', '==', messageId)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function montar() {
  await db.collection('households').doc(FAMILIA).set({
    name: 'Família do áudio',
    subscription: {
      status: 'active', provider: 'manual', priceCents: 2490,
      currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('households').doc(FAMILIA).collection('members')
    .doc('wa-5564999990001').set({ role: 'member', name: 'Kirk', phone: '5564999990001' });

  await db.collection('whatsappConfigs').doc(FAMILIA).set({
    householdId: FAMILIA,
    enabled: true,
    modo: 'grupo',
    instanceName: INSTANCIA,
    groupId: GRUPO,
    allowPrivateChat: false,
    nomeDaAssistente: 'Nina',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const dados = escopoDe(FAMILIA);
  const mercado = await dados.criar('categories', { name: 'Mercado', type: 'EXPENSE', color: '#22c55e' });
  await dados.criar('paymentMethods', { name: 'Pix' });

  const mes = new Date().toISOString().slice(0, 7);
  await dados.criar('transactions', {
    type: 'EXPENSE', description: 'compra do mês', amount: 480,
    categoryId: mercado.id, subcategoryId: null, paymentMethodId: null,
    date: admin.firestore.Timestamp.fromDate(new Date(`${mes}-10T12:00:00Z`)),
    referenceMonth: mes, status: 'CONFIRMED', origin: 'MANUAL', paidBy: 'Kirk',
  });
}

async function limpar() {
  const colecoes = ['transactions', 'categories', 'subcategories', 'paymentMethods',
    'chatSessions', 'whatsappLogs', 'pendingSubcategoryConfirmations', 'memoriaDeDescricao'];
  for (const c of colecoes) {
    const snap = await db.collection(c).where('householdId', '==', FAMILIA).get();
    if (!snap.size) continue;
    const lote = db.batch();
    snap.docs.forEach((d) => lote.delete(d.ref));
    await lote.commit();
  }
  const membros = await db.collection('households').doc(FAMILIA).collection('members').get();
  for (const m of membros.docs) await m.ref.delete();
  await db.collection('whatsappConfigs').doc(FAMILIA).delete().catch(() => {});
  await db.collection('households').doc(FAMILIA).delete().catch(() => {});
}

/** Manda um áudio cuja transcrição é `fala`. */
async function falar(fala) {
  falaAtual = fala;
  const id = `AUDIO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await processarMensagemRecebida(payloadDeAudio(id));
  return { id, logs: await logsDe(id) };
}

async function principal() {
  console.log('\n=== ÁUDIO NA ASSISTENTE (Fase 3) ===');
  console.log(`Família descartável: ${FAMILIA}\n`);

  await montar();

  // 1. O QUE NÃO PODE REGREDIR: áudio de lançamento continua lançando.
  console.log('1. Áudio de lançamento continua virando lançamento');
  const lanc = await falar('gastei 37,50 no mercado');
  checar('gravou UM log', lanc.logs.length === 1, `gravou ${lanc.logs.length}`);
  checar('virou lançamento', !!lanc.logs[0]?.transactionId,
    `transactionId=${lanc.logs[0]?.transactionId}`);
  checar('guardou a transcrição no log',
    (lanc.logs[0]?.content || '').includes('mercado'),
    `content=${JSON.stringify(lanc.logs[0]?.content)}`);

  if (lanc.logs[0]?.transactionId) {
    const t = await db.collection('transactions').doc(lanc.logs[0].transactionId).get();
    checar('o valor está certo', t.data()?.amount === 37.5, `amount=${t.data()?.amount}`);
  }

  // 2. O BUG: pergunta falada COM o nome.
  console.log('\n2. Pergunta falada com o nome da assistente');
  const comNome = await falar('Nina, quanto gastei em mercado esse mês?');
  checar('gravou UM log', comNome.logs.length === 1, `gravou ${comNome.logs.length}`);
  checar('NÃO virou lançamento', !comNome.logs[0]?.transactionId,
    `virou lançamento ${comNome.logs[0]?.transactionId}`);
  checar('terminou como PROCESSED (e não ERROR)',
    comNome.logs[0]?.processingStatus === 'PROCESSED',
    `status=${comNome.logs[0]?.processingStatus}`);

  const sessoes = await db.collection('chatSessions').where('householdId', '==', FAMILIA).get();
  checar('a assistente respondeu de verdade', sessoes.size >= 1, `${sessoes.size} sessões`);

  // 3. Pergunta falada SEM o nome — cai no fallback, igual ao texto.
  console.log('\n3. Pergunta falada SEM o nome');
  const semNome = await falar('quanto foi que eu gastei no mercado esse mês');
  checar('gravou UM log', semNome.logs.length === 1, `gravou ${semNome.logs.length}`);
  checar('NÃO virou lançamento', !semNome.logs[0]?.transactionId);
  checar('não terminou em ERROR', semNome.logs[0]?.processingStatus !== 'ERROR',
    `status=${semNome.logs[0]?.processingStatus} erro=${semNome.logs[0]?.errorMessage}`);

  // 4. Transcrição com erro no nome — o casamento tolerante cobre.
  console.log('\n4. Transcrição erra o nome ("Nyna")');
  const nomeErrado = await falar('Nyna, quanto gastei em mercado?');
  checar('NÃO virou lançamento', !nomeErrado.logs[0]?.transactionId);
  checar('foi tratado como conversa',
    nomeErrado.logs[0]?.processingStatus === 'PROCESSED',
    `status=${nomeErrado.logs[0]?.processingStatus}`);

  // 5. O caso que falhou ao vivo em 19/08.
  console.log('\n5. O áudio que falhou ao vivo: pedido de alteração');
  const alterar = await falar('Nina, mude a categoria do último lançamento para Mercado');
  checar('NÃO devolveu "não entendi"',
    alterar.logs[0]?.processingStatus !== 'ERROR',
    `erro=${alterar.logs[0]?.errorMessage}`);

  // 6. O que falhou ao vivo em 20/08: confirmar POR ÁUDIO.
  //
  // No texto, "Sim" com uma proposta aberta vira confirmação. Falado, ia para
  // o parser e voltava «⚠️ Não entendi "Sim". Comece dizendo se gastou ou
  // recebeu» — a exclusão proposta ficava pendente para sempre.
  console.log('\n6. "Sim" falado confirma a proposta da Nina');
  await falar('Nina, apague o lançamento de compra do mês');

  const sim = await falar('Sim');
  checar('o "Sim" falado NÃO virou "não entendi"',
    sim.logs[0]?.processingStatus !== 'ERROR',
    `erro=${sim.logs[0]?.errorMessage}`);

  const sobrou = await db.collection('transactions')
    .where('householdId', '==', FAMILIA).where('description', '==', 'compra do mês').get();
  checar('o lançamento foi excluído de verdade', sobrou.empty,
    `ainda existem ${sobrou.size}`);

  // 7. Saudação falada morre em silêncio, como no texto.
  console.log('\n7. "Bom dia" falado não vira "não entendi"');
  const bomDia = await falar('Bom dia');
  checar('não respondeu "não entendi"', bomDia.logs[0]?.processingStatus !== 'ERROR',
    `erro=${bomDia.logs[0]?.errorMessage}`);
  checar('foi tratado como conversa fiada',
    bomDia.logs[0]?.processingStatus === 'CANCELLED',
    `status=${bomDia.logs[0]?.processingStatus}`);
  checar('NÃO virou lançamento', !bomDia.logs[0]?.transactionId);

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
