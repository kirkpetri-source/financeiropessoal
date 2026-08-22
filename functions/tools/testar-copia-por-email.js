/**
 * Testa a cópia semanal de backup por e-mail.
 *
 *   node tools/testar-copia-por-email.js            # SÓ verifica o endereço
 *   node tools/testar-copia-por-email.js --com-anexo # manda a cópia de verdade
 *
 * O padrão é SEM anexo, e isso é deliberado: o anexo é a base financeira
 * completa das famílias pagantes. Confirmar que o endereço existe e é de quem
 * se espera vem ANTES de qualquer dado sair — mandar a base para um endereço
 * digitado errado é o tipo de erro que não tem desfazer.
 *
 * A senha do zip NUNCA é impressa aqui.
 */

const { carregar } = require('./carregarAmbiente');

carregar(['BACKUP_BUCKET', 'BACKUP_EMAIL_DESTINO', 'RESEND_API_KEY', 'BACKUP_ZIP_SENHA']);

const backupEmail = require('../src/services/backupEmailService');

const comAnexo = process.argv.includes('--com-anexo');
const destino = process.env.BACKUP_EMAIL_DESTINO;

(async () => {
  if (!destino) {
    console.error('BACKUP_EMAIL_DESTINO não está definido no .env deste ambiente.');
    process.exit(1);
  }

  console.log(`Destinatário : ${destino}`);
  console.log(`Modo         : ${comAnexo ? 'CÓPIA COM ANEXO (dados reais)' : 'só verificação, sem anexo'}`);
  console.log(`Senha do zip : ${process.env.BACKUP_ZIP_SENHA ? 'configurada' : 'AUSENTE'}`);
  console.log('');

  if (comAnexo && !process.env.BACKUP_ZIP_SENHA) {
    console.error('Sem BACKUP_ZIP_SENHA o anexo não sai — e não deve mesmo.');
    console.error('Configure com: firebase functions:secrets:set BACKUP_ZIP_SENHA');
    process.exit(1);
  }

  const r = await backupEmail.enviarCopia({ comAnexo });

  if (!r.enviado) {
    console.error('NÃO ENVIADO:', r.motivo, r.erro || '');
    process.exit(1);
  }

  console.log('ENVIADO.');
  console.log('  backup :', r.backup);
  if (r.arquivo) console.log('  arquivo:', r.arquivo, `(${r.megabytes} MB criptografado)`);
  console.log('');
  console.log(comAnexo
    ? `Para abrir: ${backupEmail.COMO_ABRIR.replace('ARQUIVO', r.arquivo)}`
    : 'Confirme que a mensagem chegou ANTES de ligar a cópia com anexo.');
})().catch((err) => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
