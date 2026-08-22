import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  criarBackupEmailService, criptografar, descriptografar, COMO_ABRIR,
} from './backupEmailService.js';

const SENHA = 'senha-do-zip-forte-2026';
const AGORA = new Date('2026-08-24T06:00:00Z');

const INTEGRO = {
  id: 'diario/2026-08-24T02-00-00-000Z', gaveta: 'diario',
  arquivos: 23, bytes: 3_262_000, megabytes: 3.11, completo: true,
  criadoEm: '2026-08-24T02:00:00Z',
};
const INCOMPLETO = { ...INTEGRO, id: 'diario/parcial', completo: false };

function montar({ lista = [INTEGRO], destino = 'copia@exemplo.com', senha = SENHA } = {}) {
  const backup = {
    listar: vi.fn(async () => lista),
    baixar: vi.fn(async (id) => ({
      nome: `${id.replace(/\//g, '_')}.zip`,
      conteudo: Buffer.from('conteudo-do-backup'),
    })),
  };
  const email = { enviar: vi.fn(async () => ({ enviado: true, id: 'msg-1' })) };

  const servico = criarBackupEmailService({
    backup, email, destino, senhaDoZip: senha, agora: () => AGORA,
  });

  return { servico, backup, email };
}

describe('criptografia — compatível com o openssl', () => {
  it('o ciclo fecha: o que é cifrado volta ao original', () => {
    const original = Buffer.from('dados financeiros de 13 familias');

    const cifrado = criptografar(original, SENHA);
    expect(cifrado.equals(original)).toBe(false);

    expect(descriptografar(cifrado, SENHA).equals(original)).toBe(true);
  });

  it('começa com o cabeçalho Salted__ que o openssl espera', () => {
    const cifrado = criptografar(Buffer.from('x'), SENHA);

    expect(cifrado.subarray(0, 8).toString('utf8')).toBe('Salted__');
  });

  it('senha errada NÃO devolve o conteúdo', () => {
    const cifrado = criptografar(Buffer.from('segredo'), SENHA);

    // Com padding PKCS#7, chave errada quase sempre derruba no `final()`.
    // Se não derrubar, o conteúdo ainda sai diferente — as duas saídas são
    // aceitáveis; o que não pode é devolver o original.
    let saiuIgual = false;
    try {
      saiuIgual = descriptografar(cifrado, 'chute').toString() === 'segredo';
    } catch { saiuIgual = false; }

    expect(saiuIgual).toBe(false);
  });

  it('cada cifragem usa um sal novo — dois envios iguais não geram bytes iguais', () => {
    const a = criptografar(Buffer.from('mesmo conteudo'), SENHA);
    const b = criptografar(Buffer.from('mesmo conteudo'), SENHA);

    expect(a.equals(b)).toBe(false);
  });

  it('o openssl de verdade abre o arquivo', () => {
    // O ponto INTEIRO do formato é não depender deste projeto num desastre.
    // Um teste que só usa o nosso próprio `descriptografar` provaria apenas
    // que somos consistentes com nós mesmos.
    let temOpenssl = true;
    try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); } catch { temOpenssl = false; }
    if (!temOpenssl) return;

    const pasta = mkdtempSync(join(tmpdir(), 'backup-enc-'));
    try {
      const original = Buffer.from('linha1\nlinha2\ndados do backup');
      const entrada = join(pasta, 'arquivo.enc');
      const saida = join(pasta, 'arquivo.zip');
      writeFileSync(entrada, criptografar(original, SENHA));

      execFileSync('openssl', [
        'enc', '-d', '-aes-256-cbc', '-pbkdf2',
        '-in', entrada, '-out', saida, '-pass', `pass:${SENHA}`,
      ]);

      expect(readFileSync(saida).equals(original)).toBe(true);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('a instrução que vai no e-mail é a que funciona', () => {
    expect(COMO_ABRIR).toContain('openssl enc -d -aes-256-cbc -pbkdf2');
  });
});

describe('enviarCopia', () => {
  it('anexa o backup CIFRADO, com extensão .enc', async () => {
    const { servico, email } = montar();

    const r = await servico.enviarCopia();

    const [chamada] = email.enviar.mock.calls[0];
    expect(chamada.para).toBe('copia@exemplo.com');
    expect(chamada.anexos).toHaveLength(1);
    expect(chamada.anexos[0].filename).toBe('diario_2026-08-24T02-00-00-000Z.zip.enc');
    expect(r.enviado).toBe(true);

    const anexado = Buffer.from(chamada.anexos[0].content, 'base64');
    expect(anexado.subarray(0, 8).toString()).toBe('Salted__');
    expect(descriptografar(anexado, SENHA).toString()).toBe('conteudo-do-backup');
  });

  it('a SENHA nunca viaja no e-mail', async () => {
    const { servico, email } = montar();

    await servico.enviarCopia();

    const [chamada] = email.enviar.mock.calls[0];
    expect(chamada.texto).not.toContain(SENHA);
    expect(chamada.html).not.toContain(SENHA);
    expect(chamada.assunto).not.toContain(SENHA);
  });

  it('o e-mail ensina a abrir o arquivo', async () => {
    const { servico, email } = montar();

    await servico.enviarCopia();

    // Num desastre, quem recebe precisa conseguir abrir sem procurar ajuda.
    expect(email.enviar.mock.calls[0][0].texto).toContain('openssl enc -d');
  });

  it('escolhe o backup mais recente que esteja ÍNTEGRO', async () => {
    const { servico, backup } = montar({ lista: [INCOMPLETO, INTEGRO] });

    await servico.enviarCopia();

    expect(backup.baixar).toHaveBeenCalledWith(INTEGRO.id);
  });

  it('sem NENHUM backup íntegro, recusa em vez de mandar lixo', async () => {
    const { servico, email } = montar({ lista: [INCOMPLETO] });

    await expect(servico.enviarCopia())
      .rejects.toMatchObject({ codigo: 'SEM_BACKUP_INTEGRO' });

    expect(email.enviar).not.toHaveBeenCalled();
  });

  it('SEM senha configurada, o anexo NÃO sai — nunca em texto claro', async () => {
    const { servico, email } = montar({ senha: null });

    await expect(servico.enviarCopia())
      .rejects.toMatchObject({ codigo: 'SENHA_DO_ZIP_AUSENTE' });

    expect(email.enviar).not.toHaveBeenCalled();
  });

  it('sem destinatário configurado, recusa', async () => {
    const { servico, email } = montar({ destino: null });

    await expect(servico.enviarCopia())
      .rejects.toMatchObject({ codigo: 'DESTINO_NAO_CONFIGURADO' });

    expect(email.enviar).not.toHaveBeenCalled();
  });

  it('modo verificação manda o aviso SEM anexo nenhum', async () => {
    const { servico, email, backup } = montar();

    const r = await servico.enviarCopia({ comAnexo: false });

    const [chamada] = email.enviar.mock.calls[0];
    expect(chamada.anexos).toBeUndefined();
    expect(backup.baixar).not.toHaveBeenCalled();
    expect(r.verificacao).toBe(true);
  });

  it('backup grande demais para anexo manda usar o painel', async () => {
    const { servico, email } = montar();
    const grande = { ...INTEGRO };
    const servicoGrande = criarBackupEmailService({
      backup: {
        listar: async () => [grande],
        baixar: async () => ({ nome: 'x.zip', conteudo: Buffer.alloc(20 * 1024 * 1024) }),
      },
      email,
      destino: 'copia@exemplo.com',
      senhaDoZip: SENHA,
      agora: () => AGORA,
    });

    await expect(servicoGrande.enviarCopia())
      .rejects.toMatchObject({ codigo: 'ANEXO_GRANDE_DEMAIS' });
  });
});
