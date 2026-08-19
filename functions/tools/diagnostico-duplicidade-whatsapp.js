/**
 * Diagnóstico SOMENTE LEITURA: quantas mensagens do WhatsApp viraram mais de
 * um registro em `whatsappLogs`, e por qual caminho.
 *
 * Existe porque em 18/08/2026 o teste ao vivo da assistente mostrou o mesmo
 * `messageId` gravado duas vezes, com 1-2s de diferença — o que significa
 * chamada de IA paga em dobro. Antes de consertar é preciso saber QUAL das
 * duas causas possíveis é a real: reentrega do webhook (corrida entre o
 * "já processada?" e a gravação) ou o caminho de fallback do roteador, que
 * cria um log e depois chama a assistente, que cria outro.
 *
 * Não escreve nada. Pode rodar em produção à vontade.
 */

const { carregar } = require('./carregarAmbiente');
carregar();

const { db } = require('../src/config/firebaseAdmin');

const householdId = process.argv[2] || null;
const LIMITE = Number(process.env.LIMITE || 500);

function horario(ts) {
  const d = ts?.toDate?.();
  return d ? d.toISOString().replace('T', ' ').slice(0, 23) : '(sem createdAt)';
}

(async () => {
  let query = db.collection('whatsappLogs');
  if (householdId) query = query.where('householdId', '==', householdId);

  const snap = await query.orderBy('createdAt', 'desc').limit(LIMITE).get();

  console.log(`\nLidos ${snap.size} registros mais recentes` +
    (householdId ? ` da família ${householdId}` : ' (todas as famílias)') + '.\n');

  const porMensagem = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!d.messageId) continue;
    const chave = `${d.householdId}|${d.messageId}`;
    if (!porMensagem.has(chave)) porMensagem.set(chave, []);
    porMensagem.get(chave).push({ id: doc.id, ...d });
  }

  const duplicadas = [...porMensagem.entries()].filter(([, v]) => v.length > 1);

  console.log(`Mensagens distintas: ${porMensagem.size}`);
  console.log(`Mensagens com MAIS DE UM registro: ${duplicadas.length}\n`);

  if (!duplicadas.length) {
    console.log('Nenhuma duplicidade nesta janela.');
    process.exit(0);
  }

  for (const [chave, registros] of duplicadas.slice(0, 20)) {
    const [fam, messageId] = chave.split('|');
    console.log(`--- ${messageId}  (família ${fam}) — ${registros.length} registros`);

    const ordenados = [...registros].sort((a, b) =>
      (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));

    let anterior = null;
    for (const r of ordenados) {
      const ms = r.createdAt?.toMillis?.() || 0;
      const delta = anterior ? `  (+${((ms - anterior) / 1000).toFixed(2)}s)` : '';
      anterior = ms;
      console.log(`    ${horario(r.createdAt)}${delta}`);
      console.log(`      docId=${r.id}`);
      console.log(`      status=${r.processingStatus}  tipo=${r.messageType}` +
        `  temPayload=${r.rawPayload ? 'sim' : 'NAO'}` +
        `  transactionId=${r.transactionId || '-'}`);
      console.log(`      conteudo=${JSON.stringify((r.content || '').slice(0, 70))}`);
    }
    console.log('');
  }

  // A assinatura de cada causa:
  //   - fallback do roteador: o 1o registro tem rawPayload, o 2o NÃO tem
  //     (conversarComAssistente cria o log sem rawPayload)
  //   - reentrega do webhook: os DOIS têm rawPayload
  let fallback = 0;
  let reentrega = 0;
  let outro = 0;
  for (const [, registros] of duplicadas) {
    const comPayload = registros.filter((r) => r.rawPayload).length;
    if (registros.length === 2 && comPayload === 1) fallback++;
    else if (comPayload === registros.length) reentrega++;
    else outro++;
  }

  console.log('===== CAUSA PROVÁVEL =====');
  console.log(`  fallback do roteador (1 com payload + 1 sem): ${fallback}`);
  console.log(`  reentrega/corrida (todos com payload):        ${reentrega}`);
  console.log(`  outro padrão:                                 ${outro}`);
  process.exit(0);
})().catch((err) => {
  console.error('Falhou:', err.message);
  process.exit(1);
});
