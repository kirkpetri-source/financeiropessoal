/**
 * Acompanha, ao vivo, o que acontece com as mensagens de uma família no
 * WhatsApp. SOMENTE LEITURA.
 *
 * Serve para assistir a um teste real acontecendo: cada mensagem que entra
 * aparece aqui com o que o sistema fez com ela — virou lançamento, virou
 * conversa com a assistente, foi ignorada ou deu erro. É o que substitui
 * ficar pedindo print da tela do celular.
 *
 * O que olhar em cada linha:
 *   PROCESSED + transactionId  -> virou lançamento
 *   PROCESSED sem transaction  -> foi conversa com a assistente
 *   CANCELLED                  -> o roteador decidiu ignorar (conversa fiada)
 *   ERROR                      -> respondeu "não entendi" ou falhou
 *   BOT                        -> resposta que o próprio sistema enviou
 *
 * Mensagem que NÃO aparece aqui foi descartada antes de virar log — que é
 * justamente o tipo de falha silenciosa que já custou caro neste projeto.
 *
 *   node tools/acompanhar-whatsapp.js <householdId>
 *   node tools/acompanhar-whatsapp.js <householdId> --historico 20
 */

const { carregar } = require('./carregarAmbiente');
carregar();

const { db } = require('../src/config/firebaseAdmin');

const householdId = process.argv[2];
const historicoPedido = process.argv.includes('--historico')
  ? Number(process.argv[process.argv.indexOf('--historico') + 1]) || 10
  : 0;

if (!householdId) {
  console.error('\n  Falta o householdId. Use:');
  console.error('    node tools/acompanhar-whatsapp.js <householdId>\n');
  process.exit(1);
}

const INTERVALO_MS = 4000;
const vistos = new Set();

function hora(ts) {
  const d = ts?.toDate?.();
  if (!d) return '--:--:--';
  return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function rotulo(log) {
  if (log.processingStatus === 'BOT') return 'RESPOSTA DO SISTEMA';
  if (log.processingStatus === 'ERROR') return 'ERRO';
  if (log.processingStatus === 'CANCELLED') return 'IGNORADA';
  if (log.processingStatus === 'PENDING') return 'PROCESSANDO...';
  if (log.transactionId) return 'LANCAMENTO';
  return 'CONVERSA COM A NINA';
}

async function detalheDaTransacao(id) {
  if (!id) return null;
  const doc = await db.collection('transactions').doc(id).get();
  if (!doc.exists) return null;
  const t = doc.data();
  return `${t.type === 'INCOME' ? '+' : '-'}R$ ${Number(t.amount).toFixed(2)} · ${t.description}`;
}

async function mostrar(log, novo) {
  const marca = novo ? '>>' : '  ';
  console.log(`${marca} [${hora(log.createdAt)}] ${rotulo(log)}  (${log.messageType})`);

  if (log.content) {
    const texto = String(log.content).replace(/\s+/g, ' ').slice(0, 160);
    console.log(`      "${texto}"`);
  }

  if (log.transactionId) {
    const det = await detalheDaTransacao(log.transactionId);
    if (det) console.log(`      -> ${det}`);
  }

  if (log.errorMessage) {
    console.log(`      -> ${String(log.errorMessage).replace(/\s+/g, ' ').slice(0, 160)}`);
  }

  console.log('');
}

async function ciclo(primeiraVez) {
  // `where` sozinho + ordenação em memória: com orderBy no mesmo query o
  // Firestore exigiria índice composto (regra 12), e aqui são dezenas de
  // documentos, não milhares.
  const snap = await db.collection('whatsappLogs')
    .where('householdId', '==', householdId)
    .get();

  const logs = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));

  if (primeiraVez) {
    // Tudo que já existe entra como "visto" para não despejar meses de
    // histórico na tela — menos o pedaço que a pessoa pediu para ver.
    const mostrarDoFim = historicoPedido ? logs.slice(-historicoPedido) : [];
    const idsDoFim = new Set(mostrarDoFim.map((l) => l.id));

    logs.forEach((l) => vistos.add(l.id));

    if (mostrarDoFim.length) {
      console.log(`--- ultimas ${mostrarDoFim.length} mensagens (historico) ---\n`);
      for (const l of logs.filter((l) => idsDoFim.has(l.id))) await mostrar(l, false);
    }

    console.log('--- esperando mensagens novas (Ctrl+C para sair) ---\n');
    return;
  }

  for (const l of logs) {
    if (vistos.has(l.id)) continue;
    vistos.add(l.id);
    await mostrar(l, true);
  }
}

(async () => {
  const fam = await db.collection('households').doc(householdId).get();
  console.log(`\nAcompanhando: ${fam.data()?.name || '(familia sem nome)'}  [${householdId}]\n`);

  await ciclo(true);

  setInterval(() => {
    ciclo(false).catch((err) => console.error('Falha ao ler:', err.message));
  }, INTERVALO_MS);
})().catch((err) => {
  console.error('Falhou:', err.message);
  process.exit(1);
});
