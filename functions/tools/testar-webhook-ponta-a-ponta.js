/**
 * Exercita o WEBHOOK do WhatsApp inteiro — `processarMensagemRecebida` — do
 * payload cru do Evolution até o que sobra no Firestore.
 *
 * POR QUE ISTO EXISTE COMO SCRIPT, E NÃO COMO TESTE DE UNIDADE
 *
 * O webhook não tem teste automatizado e não pode ter: ele importa
 * `whatsappLogService`, que importa `firebaseAdmin` no topo, e a trava da
 * regra 2 derruba qualquer suíte que carregue isso. Foi exatamente por essa
 * lacuna que as QUATRO falhas do teste ao vivo de 18/08/2026 passaram pelos
 * 810 testes verdes: todas moram entre o WhatsApp real e o sistema.
 *
 * O envio da resposta falha de propósito (a URL do Evolution em homologação é
 * inválida) e isso não atrapalha: `responder()` engole falha de envio, então
 * tudo que acontece no banco — que é o que este teste mede — acontece igual.
 *
 *   ALVO=staging node tools/testar-webhook-ponta-a-ponta.js
 */

const { carregar } = require('./carregarAmbiente');

if (String(process.env.ALVO || '').toLowerCase() !== 'staging') {
  console.error('\n  Este script só roda em homologação. Use:');
  console.error('    ALVO=staging node tools/testar-webhook-ponta-a-ponta.js\n');
  process.exit(1);
}

carregar(['GEMINI_API_KEY']);

const { db, admin } = require('../src/config/firebaseAdmin');
const { escopoDe } = require('../src/data/escopo');
const { processarMensagemRecebida } = require('../src/webhooks/evolutionWebhook');

const FAMILIA = `webhook-${Date.now()}`;
const GRUPO = `${Date.now()}-teste@g.us`;
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

/** Payload no formato que o Evolution manda de verdade, em grupo. */
function payload(messageId, texto) {
  return {
    body: {
      instance: INSTANCIA,
      data: {
        key: { id: messageId, remoteJid: GRUPO, fromMe: false, participant: PARTICIPANTE },
        message: { conversation: texto },
        pushName: 'Kirk',
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    },
  };
}

/** Os logs daquela mensagem — é a contagem que prova a duplicidade. */
async function logsDe(messageId) {
  const snap = await db.collection('whatsappLogs')
    .where('householdId', '==', FAMILIA)
    .where('messageId', '==', messageId)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function montar() {
  await db.collection('households').doc(FAMILIA).set({
    name: 'Família do webhook',
    subscription: {
      status: 'active',
      provider: 'manual',
      priceCents: 2490,
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
    type: 'EXPENSE',
    description: 'compra do mês',
    amount: 480,
    categoryId: mercado.id,
    subcategoryId: null,
    paymentMethodId: null,
    date: admin.firestore.Timestamp.fromDate(new Date(`${mes}-10T12:00:00Z`)),
    referenceMonth: mes,
    status: 'CONFIRMED',
    origin: 'MANUAL',
    paidBy: 'Kirk',
  });
}

async function limpar() {
  const colecoes = [
    'transactions', 'categories', 'subcategories', 'paymentMethods',
    'chatSessions', 'whatsappLogs', 'pendingSubcategoryConfirmations',
  ];
  for (const colecao of colecoes) {
    const snap = await db.collection(colecao).where('householdId', '==', FAMILIA).get();
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

async function principal() {
  console.log('\n=== WEBHOOK DO WHATSAPP — teste ponta a ponta ===');
  console.log(`Família descartável: ${FAMILIA}\n`);

  await montar();

  // 1. O BUG DE 18/08/2026: pergunta SEM o nome da assistente.
  //
  // Este é o caminho de fallback — o roteador não sabe o que é, o parser tenta
  // interpretar como lançamento, a IA diz "era pergunta" e a conversa assume.
  // Antes da correção esse caminho gravava DOIS logs da mesma mensagem, com
  // 1 a 2 segundos de diferença. Doze de doze perguntas do teste ao vivo
  // duplicaram assim.
  console.log('1. Pergunta SEM o nome (caminho de fallback — onde o bug morava)');
  const idSemNome = `TESTE-SEM-NOME-${Date.now()}`;
  await processarMensagemRecebida(payload(idSemNome, 'Quanto gastei no mercado ?'));

  const logsSemNome = await logsDe(idSemNome);
  checar('gravou UM log, e não dois', logsSemNome.length === 1,
    `gravou ${logsSemNome.length}`);
  checar('o log ficou como PROCESSED',
    logsSemNome[0]?.processingStatus === 'PROCESSED',
    `status=${logsSemNome[0]?.processingStatus}`);
  checar('o log guardou o payload cru (é o log do webhook, não um segundo)',
    !!logsSemNome[0]?.rawPayload);

  // A conversa precisa ter acontecido de verdade, não só o log ter sido salvo.
  const sessoes = await db.collection('chatSessions').where('householdId', '==', FAMILIA).get();
  checar('a assistente respondeu (a conversa entrou na memória)', sessoes.size >= 1,
    `${sessoes.size} sessões`);

  // 2. Pergunta COM o nome: caminho direto, que já gravava um log só.
  //    Continua gravando um — a correção não podia quebrar este.
  console.log('\n2. Pergunta COM o nome (caminho direto)');
  const idComNome = `TESTE-COM-NOME-${Date.now()}`;
  await processarMensagemRecebida(payload(idComNome, 'Nina, quanto gastei no mercado ?'));

  const logsComNome = await logsDe(idComNome);
  checar('gravou UM log', logsComNome.length === 1, `gravou ${logsComNome.length}`);
  checar('o log ficou como PROCESSED',
    logsComNome[0]?.processingStatus === 'PROCESSED',
    `status=${logsComNome[0]?.processingStatus}`);

  // 3. A REGRESSÃO QUE MAIS ASSUSTA: lançamento continua virando lançamento.
  //    Se a assistente engolir um gasto, ninguém percebe até o fim do mês.
  console.log('\n3. Lançamento de verdade (não pode regredir)');
  const idLancamento = `TESTE-LANCAMENTO-${Date.now()}`;
  await processarMensagemRecebida(payload(idLancamento, 'gastei 37,50 no mercado'));

  const logsLancamento = await logsDe(idLancamento);
  checar('gravou UM log', logsLancamento.length === 1, `gravou ${logsLancamento.length}`);
  checar('o log aponta para um lançamento criado', !!logsLancamento[0]?.transactionId,
    `transactionId=${logsLancamento[0]?.transactionId}`);

  if (logsLancamento[0]?.transactionId) {
    const t = await db.collection('transactions').doc(logsLancamento[0].transactionId).get();
    checar('o lançamento tem o valor certo', t.data()?.amount === 37.5,
      `amount=${t.data()?.amount}`);
  } else {
    checar('o lançamento tem o valor certo', false, 'nenhum lançamento criado');
  }

  // 4. Mensagem repetida (reenvio do Evolution) não vira segundo registro.
  console.log('\n4. Reenvio da mesma mensagem (deduplicação)');
  await processarMensagemRecebida(payload(idLancamento, 'gastei 37,50 no mercado'));
  const logsDepois = await logsDe(idLancamento);
  checar('continua com UM log depois do reenvio', logsDepois.length === 1,
    `virou ${logsDepois.length}`);

  const transacoes = await db.collection('transactions')
    .where('householdId', '==', FAMILIA).where('origin', '==', 'WHATSAPP').get();
  checar('não duplicou o lançamento', transacoes.size === 1, `${transacoes.size} lançamentos`);

  // 5. Conversa fiada não vira nada.
  console.log('\n5. Conversa fiada é ignorada');
  const idBomDia = `TESTE-BOM-DIA-${Date.now()}`;
  await processarMensagemRecebida(payload(idBomDia, 'bom dia'));
  const logsBomDia = await logsDe(idBomDia);
  checar('"bom dia" não virou log nem lançamento', logsBomDia.length === 0,
    `gravou ${logsBomDia.length}`);

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
