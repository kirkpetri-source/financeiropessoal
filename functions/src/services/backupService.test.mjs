import { describe, it, expect, vi } from 'vitest';
import { criarServicoDeBackup, nomeDaPasta } from './backupService.js';

const AGORA = new Date('2026-08-22T05:30:00.000Z');

function criarCliente() {
  return {
    databasePath: (projeto, banco) => `projects/${projeto}/databases/${banco}`,
    exportDocuments: vi.fn(async () => [{ name: 'operacao-123' }]),
  };
}

describe('backupService', () => {
  it('exporta para o bucket configurado, com pasta ordenável por data', async () => {
    const cliente = criarCliente();
    const backup = criarServicoDeBackup({ cliente, projectId: 'proj', bucket: 'meu-bucket' });

    const r = await backup.exportarAgora(AGORA);

    expect(r.destino).toBe('gs://meu-bucket/2026-08-22T05-30-00-000Z');
    expect(r.operacao).toBe('operacao-123');
    expect(cliente.exportDocuments).toHaveBeenCalledWith({
      name: 'projects/proj/databases/(default)',
      outputUriPrefix: 'gs://meu-bucket/2026-08-22T05-30-00-000Z',
      collectionIds: [],
    });
  });

  it('SEM bucket configurado, falha alto — backup que não acontece não pode ser silencioso', async () => {
    const cliente = criarCliente();
    const backup = criarServicoDeBackup({ cliente, projectId: 'proj', bucket: null });

    await expect(backup.exportarAgora(AGORA))
      .rejects.toMatchObject({ codigo: 'BUCKET_NAO_CONFIGURADO' });

    expect(cliente.exportDocuments).not.toHaveBeenCalled();
  });

  it('o nome da pasta não tem dois-pontos — atrapalham na linha de comando', () => {
    expect(nomeDaPasta(AGORA)).not.toContain(':');
    expect(nomeDaPasta(AGORA)).toBe('2026-08-22T05-30-00-000Z');
  });

  it('nomes de pasta ordenam cronologicamente como texto', () => {
    const antes = nomeDaPasta(new Date('2026-08-21T23:00:00Z'));
    const depois = nomeDaPasta(new Date('2026-08-22T01:00:00Z'));

    expect([depois, antes].sort()).toEqual([antes, depois]);
  });
});
