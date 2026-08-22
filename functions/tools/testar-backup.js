/**
 * Dispara um backup do Firestore AGORA e acompanha até terminar.
 *
 *   node tools/testar-backup.js                 # produção
 *   ALVO=staging node tools/testar-backup.js    # homologação
 *
 * É o mesmo caminho que a agendada `backupDiario` usa (exportDocuments para o
 * bucket de `BACKUP_BUCKET`), então provar aqui é provar a rotina. Só LEITURA
 * do Firestore — um export não altera nem um documento.
 *
 * Serve também como o botão de "backup manual antes de mexer em algo", que
 * antes só existia como `npm run backup` (dump em JSON, outra coisa: bom para
 * ler, ruim para restaurar o banco inteiro).
 */

const { carregar } = require('./carregarAmbiente');

carregar(['BACKUP_BUCKET']);

const { v1 } = require('@google-cloud/firestore');
const { projectId, caminhoDaCredencial } = require('../src/config/firebaseAdmin');
const { criarServicoDeBackup } = require('../src/services/backupService');

const bucket = process.env.BACKUP_BUCKET;


if (!bucket) {
  console.error('BACKUP_BUCKET não está definido no .env deste ambiente.');
  console.error('Sem ele a agendada `backupDiario` falha todo dia — e agora avisa na tela.');
  process.exit(1);
}

const cliente = new v1.FirestoreAdminClient(
  caminhoDaCredencial ? { keyFilename: caminhoDaCredencial } : {},
);
const backup = criarServicoDeBackup({ cliente, projectId, bucket });

async function situacaoDa(operacao) {
  const { operationsClient } = cliente;
  const info = await operationsClient.getOperation({ name: operacao });
  return info[0];
}

(async () => {
  console.log(`\nBucket de destino: gs://${bucket}`);
  console.log('Disparando o export...\n');

  const r = await backup.exportarAgora(new Date());
  console.log('  destino :', r.destino);
  console.log('  operação:', r.operacao);

  if (!r.operacao) {
    console.log('\nSem nome de operação — não dá para acompanhar daqui.');
    return;
  }

  // O export é assíncrono e leva minutos. A agendada não espera (e não deve);
  // aqui a gente espera porque o objetivo é PROVAR que terminou bem.
  process.stdout.write('\nAguardando');
  for (let tentativa = 0; tentativa < 60; tentativa += 1) {
    await new Promise((r2) => setTimeout(r2, 5000));
    process.stdout.write('.');

    let op;
    try {
      op = await situacaoDa(r.operacao);
    } catch (err) {
      console.log(`\n\nNão consegui consultar a operação: ${err.message}`);
      console.log('O export pode ter seguido normalmente — confira o bucket.');
      return;
    }

    if (op.done) {
      console.log('\n');
      if (op.error) {
        console.error('FALHOU:', op.error.message);
        process.exit(1);
      }
      console.log('BACKUP CONCLUÍDO.');
      console.log(`Restaurar com: gcloud firestore import ${r.destino}`);
      return;
    }
  }

  console.log('\n\nAinda rodando depois de 5 minutos — normal em banco grande.');
  console.log(`Acompanhe a operação: ${r.operacao}`);
})().catch((err) => {
  console.error('\nERRO:', err.message);
  if (String(err.message).includes('PERMISSION_DENIED') || err.code === 7) {
    console.error('\nA conta de serviço precisa de:');
    console.error('  - roles/datastore.importExportAdmin no projeto');
    console.error(`  - roles/storage.objectAdmin no bucket ${bucket}`);
  }
  process.exit(1);
});
