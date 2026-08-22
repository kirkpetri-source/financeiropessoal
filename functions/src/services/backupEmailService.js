/**
 * Cópia semanal do backup para fora do sistema, por e-mail.
 *
 * Pedido do Kirk em 22/08/2026, depois de eu levantar o risco e ele reafirmar
 * a escolha. O registro do risco fica aqui porque quem mexer nisto no futuro
 * precisa saber o que está em jogo:
 *
 *   O anexo é a base financeira COMPLETA das famílias pagantes. Uma vez
 *   enviado, existe uma cópia permanente na caixa de destino e outra na pasta
 *   de enviados do provedor. Quem tiver acesso a esse e-mail tem a base.
 *
 * Duas defesas foram construídas em cima dessa decisão:
 *
 *   1. O anexo vai SEMPRE criptografado (AES-256-CBC + PBKDF2), com senha que
 *      vive no Secret Manager e nunca viaja junto. Sem a senha, o anexo é
 *      ruído.
 *   2. O formato é o do `openssl enc`, e não um formato nosso. Num desastre
 *      de verdade — sem este repositório, sem esta máquina — o arquivo ainda
 *      abre com um comando que existe em qualquer Linux, Mac ou Git Bash:
 *
 *        openssl enc -d -aes-256-cbc -pbkdf2 -in backup.zip.enc -out backup.zip
 *
 *      Um formato proprietário transformaria o backup de emergência em algo
 *      que só abre com ajuda, que é o oposto do objetivo.
 */

const crypto = require('crypto');

/** Teto do anexo. Resend aceita 40 MB de payload; o Gmail recebe 25 MB. */
const MAXIMO_ANEXO_BYTES = 15 * 1024 * 1024;

/**
 * Parâmetros do `openssl enc -aes-256-cbc -pbkdf2`, sem inventar nada:
 * cabeçalho `Salted__`, sal de 8 bytes, PBKDF2-SHA256 com 10.000 iterações,
 * e 48 bytes derivados (32 de chave + 16 de IV). Mudar qualquer um destes
 * números quebra a compatibilidade com o comando acima.
 */
const OPENSSL = {
  magica: Buffer.from('Salted__', 'utf8'),
  bytesDeSal: 8,
  iteracoes: 10000,
  digest: 'sha256',
  bytesDeChave: 32,
  bytesDeIv: 16,
};

function erro(mensagem, statusCode, codigo) {
  return Object.assign(new Error(mensagem), { statusCode, codigo });
}

/** Criptografa um buffer no formato que o `openssl enc` sabe abrir. */
function criptografar(conteudo, senha) {
  const sal = crypto.randomBytes(OPENSSL.bytesDeSal);

  const derivado = crypto.pbkdf2Sync(
    Buffer.from(String(senha), 'utf8'),
    sal,
    OPENSSL.iteracoes,
    OPENSSL.bytesDeChave + OPENSSL.bytesDeIv,
    OPENSSL.digest,
  );

  const chave = derivado.subarray(0, OPENSSL.bytesDeChave);
  const iv = derivado.subarray(OPENSSL.bytesDeChave);

  const cifra = crypto.createCipheriv('aes-256-cbc', chave, iv);

  return Buffer.concat([
    OPENSSL.magica, sal,
    cifra.update(conteudo), cifra.final(),
  ]);
}

/** O caminho de volta. Existe para o teste provar o ciclo inteiro. */
function descriptografar(conteudo, senha) {
  const magica = conteudo.subarray(0, 8);
  if (!magica.equals(OPENSSL.magica)) {
    throw erro('Arquivo não está no formato do openssl enc.', 400, 'FORMATO_INVALIDO');
  }

  const sal = conteudo.subarray(8, 16);
  const derivado = crypto.pbkdf2Sync(
    Buffer.from(String(senha), 'utf8'),
    sal,
    OPENSSL.iteracoes,
    OPENSSL.bytesDeChave + OPENSSL.bytesDeIv,
    OPENSSL.digest,
  );

  const decifra = crypto.createDecipheriv(
    'aes-256-cbc',
    derivado.subarray(0, OPENSSL.bytesDeChave),
    derivado.subarray(OPENSSL.bytesDeChave),
  );

  return Buffer.concat([decifra.update(conteudo.subarray(16)), decifra.final()]);
}

function megabytes(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function criarBackupEmailService({
  backup, email, destino, senhaDoZip, agora = () => new Date(),
}) {
  /**
   * Pega o backup mais recente e ÍNTEGRO.
   *
   * Íntegro importa: mandar um export interrompido daria a sensação de ter
   * cópia de segurança sem ter — o pior estado possível para um backup.
   */
  async function escolherBackup() {
    const lista = await backup.listar();
    const bom = lista.find((b) => b.completo);

    if (!bom) throw erro('Nenhum backup íntegro para enviar.', 409, 'SEM_BACKUP_INTEGRO');
    return bom;
  }

  /**
   * Manda a cópia da semana.
   *
   * `comAnexo: false` envia só o aviso — é como se confirma que o endereço
   * existe e é de quem se espera ANTES de qualquer dado sair. Mandar a base
   * inteira para um endereço não verificado seria o erro mais caro possível
   * desta função.
   */
  async function enviarCopia({ comAnexo = true } = {}) {
    if (!destino) {
      throw erro(
        'BACKUP_EMAIL_DESTINO não configurado — cópia semanal desligada.',
        503, 'DESTINO_NAO_CONFIGURADO',
      );
    }
    if (comAnexo && !senhaDoZip) {
      throw erro(
        'BACKUP_ZIP_SENHA não configurado. O anexo não sai sem criptografia.',
        503, 'SENHA_DO_ZIP_AUSENTE',
      );
    }

    const escolhido = await escolherBackup();
    const quando = agora();
    const dia = quando.toLocaleDateString('pt-BR');

    if (!comAnexo) {
      const r = await email.enviar({
        para: destino,
        assunto: 'RevelaCash — verificação do endereço de backup',
        texto: textoDeVerificacao(escolhido),
        html: htmlDeVerificacao(escolhido),
      });
      return { ...r, verificacao: true, backup: escolhido.id };
    }

    const zip = await backup.baixar(escolhido.id);
    const cifrado = criptografar(zip.conteudo, senhaDoZip);

    if (cifrado.length > MAXIMO_ANEXO_BYTES) {
      throw erro(
        `O backup compactado tem ${megabytes(cifrado.length)} MB e o limite de anexo é `
        + `${megabytes(MAXIMO_ANEXO_BYTES)} MB. Baixe pelo painel.`,
        413, 'ANEXO_GRANDE_DEMAIS',
      );
    }

    const nome = `${zip.nome}.enc`;
    const resultado = await email.enviar({
      para: destino,
      assunto: `RevelaCash — cópia de segurança de ${dia}`,
      texto: textoDaCopia(escolhido, nome, megabytes(cifrado.length)),
      html: htmlDaCopia(escolhido, nome, megabytes(cifrado.length)),
      anexos: [{ filename: nome, content: cifrado.toString('base64') }],
    });

    return {
      ...resultado,
      backup: escolhido.id,
      arquivo: nome,
      megabytes: megabytes(cifrado.length),
    };
  }

  return { enviarCopia, escolherBackup };
}

const COMO_ABRIR = 'openssl enc -d -aes-256-cbc -pbkdf2 -in ARQUIVO -out backup.zip';

function textoDeVerificacao(b) {
  return [
    'Este e-mail confirma que o endereco de copia de seguranca do RevelaCash esta correto.',
    '',
    'Nenhum dado foi anexado a esta mensagem — ela existe so para verificar o endereco',
    'antes de a copia semanal comecar a ser enviada.',
    '',
    `Backup mais recente: ${b.id} (${b.megabytes} MB, ${b.arquivos} arquivos).`,
    '',
    'Se voce NAO esperava este e-mail, avise imediatamente: kirkpetri@gmail.com',
  ].join('\n');
}

function htmlDeVerificacao(b) {
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1916;max-width:520px">
      <h2 style="font-size:16px;margin:0 0 12px">Verificação do endereço de backup</h2>
      <p style="font-size:14px;line-height:1.6;margin:0 0 12px">
        Este e-mail confirma que o endereço de cópia de segurança do RevelaCash está correto.
        <strong>Nenhum dado foi anexado</strong> — a mensagem existe só para verificar o endereço
        antes de a cópia semanal começar.
      </p>
      <p style="font-size:13px;color:#6e6a63;margin:0 0 12px">
        Backup mais recente: <code>${b.id}</code> — ${b.megabytes} MB, ${b.arquivos} arquivos.
      </p>
      <p style="font-size:13px;color:#6e6a63;margin:0">
        Se você não esperava este e-mail, avise imediatamente: kirkpetri@gmail.com
      </p>
    </div>`;
}

function textoDaCopia(b, nome, mb) {
  return [
    `Copia de seguranca do RevelaCash — ${b.id}`,
    '',
    `Arquivo: ${nome} (${mb} MB, criptografado)`,
    `Conteudo: ${b.arquivos} arquivos, ${b.megabytes} MB descompactado`,
    '',
    'O anexo esta CRIPTOGRAFADO. A senha nao viaja neste e-mail.',
    'Para abrir:',
    '',
    `  ${COMO_ABRIR.replace('ARQUIVO', nome)}`,
    '',
    'Guarde este arquivo fora do Google (HD externo, outra nuvem).',
    'Este e-mail contem dados financeiros de clientes: nao encaminhe.',
  ].join('\n');
}

function htmlDaCopia(b, nome, mb) {
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1916;max-width:520px">
      <h2 style="font-size:16px;margin:0 0 12px">Cópia de segurança — ${b.id}</h2>
      <p style="font-size:14px;line-height:1.6;margin:0 0 12px">
        Anexo: <strong>${nome}</strong> (${mb} MB, criptografado).<br>
        Conteúdo: ${b.arquivos} arquivos, ${b.megabytes} MB descompactado.
      </p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 12px">
        O anexo está <strong>criptografado</strong> e a senha não viaja neste e-mail. Para abrir:
      </p>
      <pre style="font-size:12px;background:#f5f3f0;border:1px solid #ebe8e2;border-radius:6px;
                  padding:10px;overflow-x:auto;margin:0 0 12px"><code>${COMO_ABRIR.replace('ARQUIVO', nome)}</code></pre>
      <p style="font-size:13px;color:#6e6a63;margin:0 0 8px">
        Guarde este arquivo fora do Google — HD externo ou outra nuvem.
      </p>
      <p style="font-size:13px;color:#b45309;margin:0">
        Este e-mail contém dados financeiros de clientes. Não encaminhe.
      </p>
    </div>`;
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    _padrao = criarBackupEmailService({
      backup: require('./backupService'),
      email: require('./emailService'),
      destino: process.env.BACKUP_EMAIL_DESTINO || null,
      senhaDoZip: process.env.BACKUP_ZIP_SENHA || null,
    });
  }
  return _padrao;
}

module.exports = {
  criarBackupEmailService,
  criptografar,
  descriptografar,
  MAXIMO_ANEXO_BYTES,
  COMO_ABRIR,
  enviarCopia: (...a) => servico().enviarCopia(...a),
};
