/**
 * Zera os contadores diários de UMA família — conversa com a assistente e
 * chamadas de IA de lançamento.
 *
 * Existe para teste. Uma sessão de testes consome a cota de um dia inteiro
 * rápido (20 conversas), e aí não dá para continuar validando sem esperar a
 * meia-noite. Sem isto, a alternativa seria mexer no limite global no `.env` e
 * deployar — que muda o produto para 13 famílias por causa de um teste.
 *
 * NÃO é o mesmo que aumentar o limite: o teto continua o que era, só o
 * consumo de hoje volta a zero.
 *
 * Escreve no banco, então pede `--confirmar` e mostra antes o que vai mudar.
 * Faça backup antes (regra 1): `npm run backup`.
 *
 *   node tools/zerar-limite-do-dia.js <householdId>
 *   node tools/zerar-limite-do-dia.js <householdId> --confirmar
 */

const { carregar } = require('./carregarAmbiente');
carregar();

const { admin, db } = require('../src/config/firebaseAdmin');
const { hojeNoBrasil } = require('../src/utils/fusoBrasil');

const householdId = process.argv[2];
const confirmar = process.argv.includes('--confirmar');

if (!householdId) {
  console.error('\n  Falta o householdId. Use:');
  console.error('    node tools/zerar-limite-do-dia.js <householdId> --confirmar\n');
  process.exit(1);
}

(async () => {
  const fam = await db.collection('households').doc(householdId).get();
  if (!fam.exists) {
    console.error(`\n  Família ${householdId} não existe.\n`);
    process.exit(1);
  }

  const ref = db.collection('whatsappConfigs').doc(householdId);
  const doc = await ref.get();

  if (!doc.exists) {
    console.error(`\n  ${fam.data().name} não tem canal de WhatsApp configurado —`);
    console.error('  os contadores moram nesse documento, então não há o que zerar.\n');
    process.exit(1);
  }

  const d = doc.data();
  const hoje = hojeNoBrasil(new Date());

  console.log(`\nFamília: ${fam.data().name}  [${householdId}]`);
  console.log(`Hoje no Brasil: ${hoje}\n`);
  console.log('ANTES:');
  console.log(`  conversas com a assistente : ${d.chatContagemDiaria || 0}  (dia ${d.chatContagemData || '—'})`);
  console.log(`  chamadas de IA (lançamento): ${d.iaContagemDiaria || 0}  (dia ${d.iaContagemData || '—'})`);

  if (!confirmar) {
    console.log('\n  SIMULAÇÃO — nada foi alterado.');
    console.log('  Para valer, rode de novo com --confirmar\n');
    process.exit(0);
  }

  // Zera pondo a contagem em 0 no dia de hoje, em vez de apagar o campo: o
  // serviço lê `contagemData === hoje ? contagem : 0`, então as duas formas
  // funcionam — mas deixar o dia gravado mantém o documento legível para quem
  // for depurar depois.
  await ref.set({
    chatContagemDiaria: 0,
    chatContagemData: hoje,
    iaContagemDiaria: 0,
    iaContagemData: hoje,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const depois = (await ref.get()).data();
  console.log('\nDEPOIS:');
  console.log(`  conversas com a assistente : ${depois.chatContagemDiaria}  (dia ${depois.chatContagemData})`);
  console.log(`  chamadas de IA (lançamento): ${depois.iaContagemDiaria}  (dia ${depois.iaContagemData})`);
  console.log('\nOK — a família pode voltar a conversar hoje.\n');

  process.exit(0);
})().catch((err) => {
  console.error('\nFalhou:', err.message);
  process.exit(1);
});
