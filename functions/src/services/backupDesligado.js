/**
 * Interruptor de "este ambiente não faz backup, de propósito".
 *
 * Existe por causa da HOMOLOGAÇÃO. O banco de lá é descartável — recriado por
 * script, sem cliente nenhum dentro — então guardar cópia diária dele não
 * protege nada. Mas as rotinas agendadas são as mesmas nos dois ambientes, e
 * lá elas falhavam todo dia por falta de permissão de IAM, gerando um aviso
 * operacional por dia na aba Chamados.
 *
 * Aviso que aparece todo dia e que ninguém precisa ler é pior que aviso
 * nenhum: ele treina quem olha o painel a ignorar a lista inteira, e o dia em
 * que o backup de PRODUÇÃO falhar o aviso vai estar no meio de dezenas de
 * falsos. Silenciar o ruído é o que mantém o alarme confiável.
 *
 * O desligamento é EXPLÍCITO (`BACKUP_ATIVO=false` no `.env` do ambiente), e
 * nunca inferido da ausência de configuração. A diferença importa: se um dia
 * o `BACKUP_BUCKET` sumir do ambiente de produção por engano, isso continua
 * virando erro alto e visível, como sempre foi. Só o ambiente que DIZ que não
 * quer backup é que fica em silêncio.
 */

/** true quando o ambiente pediu explicitamente para não fazer backup. */
function backupDesligado() {
  return String(process.env.BACKUP_ATIVO || '').trim().toLowerCase() === 'false';
}

module.exports = { backupDesligado };
