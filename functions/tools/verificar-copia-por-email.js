/**
 * Prova, SEM MANDAR E-MAIL NENHUM, que a cópia semanal abre e está completa.
 *
 * A cópia por e-mail é a única peça do sistema que fica FORA da plataforma —
 * é ela que salva o dia se a conta do Google inteira for perdida. E é a peça
 * com mais etapas frágeis empilhadas: baixar 21 arquivos do bucket, compactar,
 * criptografar, mandar por e-mail, e um dia descriptografar com um comando
 * digitado à mão sob estresse. Cada etapa dessas é uma chance de o arquivo na
 * caixa de entrada estar quebrado sem ninguém saber.
 *
 * Este script refaz o caminho inteiro e depois VOLTA:
 *
 *   bucket -> zip -> criptografa (senha real) -> descriptografa -> abre o zip
 *          -> confere cada arquivo, byte a byte, contra o bucket
 *
 * E faz a volta DUAS vezes: uma pelo código do projeto, outra pelo binário do
 * `openssl` instalado na máquina. A segunda é a que importa de verdade — no
 * dia do desastre não vai existir este repositório, e a promessa escrita no
 * e-mail é justamente que um `openssl enc -d` resolve. Promessa de recuperação
 * que nunca foi executada é fé, não backup.
 *
 * Nada é enviado, nada é escrito no Firestore, e a senha nunca é impressa.
 *
 *   node tools/verificar-copia-por-email.js
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { carregar } = require('./carregarAmbiente');
carregar(['BACKUP_BUCKET', 'BACKUP_ZIP_SENHA']);

const backup = require('../src/services/backupService');
const { admin } = require('../src/config/firebaseAdmin');

const MAXIMO_ANEXO_BYTES = 15 * 1024 * 1024; // igual ao do backupEmailService

let problemas = 0;
const ok = (t) => console.log(`  OK      ${t}`);
const falha = (t) => { problemas += 1; console.log(`  FALHA   ${t}`); };
const aviso = (t) => console.log(`  ATENÇÃO ${t}`);

const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`;
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Mesmo formato do backupEmailService: `openssl enc -aes-256-cbc -pbkdf2`. */
function criptografar(conteudo, senha) {
  const sal = crypto.randomBytes(8);
  const derivado = crypto.pbkdf2Sync(Buffer.from(String(senha), 'utf8'), sal, 10000, 48, 'sha256');
  const cifra = crypto.createCipheriv('aes-256-cbc', derivado.subarray(0, 32), derivado.subarray(32));
  return Buffer.concat([Buffer.from('Salted__', 'utf8'), sal, cifra.update(conteudo), cifra.final()]);
}

function descriptografar(conteudo, senha) {
  const sal = conteudo.subarray(8, 16);
  const derivado = crypto.pbkdf2Sync(Buffer.from(String(senha), 'utf8'), sal, 10000, 48, 'sha256');
  const decifra = crypto.createDecipheriv('aes-256-cbc', derivado.subarray(0, 32), derivado.subarray(32));
  return Buffer.concat([decifra.update(conteudo.subarray(16)), decifra.final()]);
}

(async () => {
  const senha = process.env.BACKUP_ZIP_SENHA;
  console.log(`\nBucket : gs://${process.env.BACKUP_BUCKET}`);
  console.log(`Senha  : ${senha ? 'carregada do Secret Manager' : 'AUSENTE'}\n`);

  if (!senha) {
    console.error('Sem BACKUP_ZIP_SENHA não há o que verificar — e sem ela o anexo não sai mesmo.\n');
    process.exit(1);
  }

  // ── o mesmo backup que a rotina de segunda-feira escolheria ──────────────
  const escolhido = await require('../src/services/backupEmailService')
    .escolherBackup?.() ?? null;

  const alvo = escolhido || (await backup.listar()).find((b) => b.completo);
  if (!alvo) {
    falha('nenhum backup íntegro para enviar');
    process.exit(1);
  }

  console.log(`Backup escolhido: ${alvo.id} (${alvo.megabytes} MB, ${alvo.arquivos} arquivos)\n`);

  console.log('--- Monta o anexo, do jeito que a rotina monta ---');
  const zip = await backup.baixar(alvo.id);
  ok(`zip gerado: ${zip.nome}, ${mb(zip.conteudo.length)}`);

  const cifrado = criptografar(zip.conteudo, senha);
  ok(`criptografado: ${mb(cifrado.length)}`);

  if (cifrado.length > MAXIMO_ANEXO_BYTES) {
    falha(`o anexo tem ${mb(cifrado.length)} e o teto é ${mb(MAXIMO_ANEXO_BYTES)} — a cópia de segunda NÃO sairia`);
  } else {
    const folga = ((1 - cifrado.length / MAXIMO_ANEXO_BYTES) * 100).toFixed(0);
    ok(`cabe no anexo: ${mb(cifrado.length)} de ${mb(MAXIMO_ANEXO_BYTES)} (${folga}% de folga)`);
  }

  // ── volta 1: pelo código ─────────────────────────────────────────────────
  console.log('\n--- Volta 1: descriptografar pelo código do projeto ---');
  const voltaCodigo = descriptografar(cifrado, senha);

  if (sha(voltaCodigo) === sha(zip.conteudo)) ok('o zip volta idêntico, byte a byte');
  else falha('o zip NÃO volta igual — a criptografia está corrompendo o conteúdo');

  // Senha errada tem que FALHAR, e não devolver lixo silenciosamente.
  try {
    descriptografar(cifrado, `${senha}-errada`);
    falha('senha errada devolveu conteúdo em vez de dar erro');
  } catch {
    ok('senha errada é recusada, como deve ser');
  }

  // ── volta 2: pelo openssl da máquina, que é a promessa do e-mail ─────────
  console.log('\n--- Volta 2: descriptografar com o binário do openssl ---');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'revelacash-backup-'));
  const arqEnc = path.join(pasta, 'copia.zip.enc');
  const arqZip = path.join(pasta, 'copia.zip');
  const arqSenha = path.join(pasta, 'senha.txt');

  try {
    fs.writeFileSync(arqEnc, cifrado);
    // A senha vai por ARQUIVO, nunca por argumento: argumento de processo é
    // visível para qualquer outro processo da máquina.
    fs.writeFileSync(arqSenha, senha, { mode: 0o600 });

    execFileSync('openssl', [
      'enc', '-d', '-aes-256-cbc', '-pbkdf2',
      '-in', arqEnc, '-out', arqZip,
      '-pass', `file:${arqSenha}`,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    const voltaOpenssl = fs.readFileSync(arqZip);
    if (sha(voltaOpenssl) === sha(zip.conteudo)) {
      ok('o openssl abre o anexo e devolve o zip idêntico');
    } else {
      falha('o openssl abriu, mas o zip saiu diferente');
    }

    // ── o zip abre e tem tudo? ─────────────────────────────────────────────
    console.log('\n--- O zip contém o export inteiro? ---');
    const JSZip = require('jszip');
    const aberto = await JSZip.loadAsync(voltaOpenssl);
    const dentro = Object.keys(aberto.files).filter((n) => !aberto.files[n].dir);

    const bucketDeArquivos = admin.storage().bucket(process.env.BACKUP_BUCKET);
    const [noBucket] = await bucketDeArquivos.getFiles({ prefix: `${alvo.id}/` });

    if (dentro.length === noBucket.length) ok(`${dentro.length} arquivo(s) no zip, mesma quantidade do bucket`);
    else falha(`o zip tem ${dentro.length} arquivo(s) e o bucket tem ${noBucket.length}`);

    const marca = dentro.some((n) => n.endsWith('.overall_export_metadata'));
    if (marca) ok('a marca de conclusão do export está dentro do zip');
    else falha('o zip não tem a marca de conclusão — restauraria um export pela metade');

    let iguais = 0;
    const diferentes = [];

    for (const arquivo of noBucket) {
      const relativo = arquivo.name.slice(alvo.id.length + 1);
      const noZip = aberto.file(relativo);

      if (!noZip) { diferentes.push(`${relativo} (ausente no zip)`); continue; }

      const [original] = await arquivo.download();
      const extraido = await noZip.async('nodebuffer');

      if (sha(original) === sha(extraido)) iguais += 1;
      else diferentes.push(`${relativo} (conteúdo diferente)`);
    }

    if (!diferentes.length) ok(`${iguais} arquivo(s) conferido(s) por SHA-256, todos idênticos ao bucket`);
    else falha(`${diferentes.length} arquivo(s) divergente(s): ${diferentes.slice(0, 5).join(', ')}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      aviso('openssl não encontrado nesta máquina — a volta 2 não foi feita');
      aviso('a promessa escrita no e-mail depende dele; testar num ambiente que o tenha');
    } else {
      falha(`openssl falhou: ${String(err.stderr || err.message).slice(0, 160)}`);
    }
  } finally {
    // Isto é a base financeira de clientes em disco. Some antes de qualquer
    // outra coisa acontecer nesta máquina.
    fs.rmSync(pasta, { recursive: true, force: true });
    console.log(`\n  (arquivos temporários apagados de ${pasta})`);
  }

  console.log('\n' + '='.repeat(66));
  if (problemas) {
    console.log(`${problemas} problema(s). A CÓPIA POR E-MAIL NÃO ESTÁ CONFIÁVEL.`);
    process.exit(1);
  }
  console.log('Cópia por e-mail confiável: abre com openssl e devolve o backup inteiro.');
  console.log('='.repeat(66) + '\n');
  process.exit(0);
})().catch((e) => { console.error('\nFalhou:', e.message, '\n'); process.exit(1); });
