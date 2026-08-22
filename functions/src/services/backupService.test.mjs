import { describe, it, expect, vi } from 'vitest';
import {
  criarServicoDeBackup, nomeDaPasta, gavetaDe, segredoConfere, raizDoExport, GAVETAS,
} from './backupService.js';

const AGORA = new Date('2026-08-22T05:30:00.000Z');
const DIA_PRIMEIRO = new Date('2026-09-01T05:30:00.000Z');
const SENHA = 'senha-de-restauracao-forte';

function criarCliente() {
  return {
    databasePath: (projeto, banco) => `projects/${projeto}/databases/${banco}`,
    exportDocuments: vi.fn(async () => [{ name: 'operacao-export' }]),
    importDocuments: vi.fn(async () => [{ name: 'operacao-import' }]),
  };
}

/** Bucket falso: uma lista de {name, size, timeCreated} vira arquivos. */
function criarBucket(arquivos = []) {
  const paraArquivo = (a) => ({
    name: a.name,
    metadata: { size: String(a.size ?? 10), timeCreated: a.timeCreated || '2026-08-22T13:52:40Z' },
    download: async () => [Buffer.from(a.conteudo || 'x')],
  });

  return {
    getFiles: vi.fn(async (opcoes = {}) => [
      arquivos
        .filter((a) => !opcoes.prefix || a.name.startsWith(opcoes.prefix))
        .map(paraArquivo),
    ]),
  };
}

const BACKUP_COMPLETO = [
  { name: 'diario/2026-08-22T13-52-40-353Z/2026-08-22T13-52-40-353Z.overall_export_metadata', size: 98 },
  { name: 'diario/2026-08-22T13-52-40-353Z/all_namespaces/all_kinds/output-0', size: 50038 },
];

function montar({ arquivos = BACKUP_COMPLETO, senha = SENHA } = {}) {
  const cliente = criarCliente();
  const bucketDeArquivos = criarBucket(arquivos);
  const backup = criarServicoDeBackup({
    cliente,
    bucketDeArquivos,
    projectId: 'proj',
    bucket: 'meu-bucket',
    senhaDeRestauracao: senha,
    agora: () => AGORA,
  });
  return { backup, cliente, bucketDeArquivos };
}

describe('exportar', () => {
  it('grava na gaveta diária, em pasta ordenável por data', async () => {
    const { backup, cliente } = montar();

    const r = await backup.exportarAgora(AGORA);

    expect(r.id).toBe('diario/2026-08-22T05-30-00-000Z');
    expect(cliente.exportDocuments).toHaveBeenCalledWith(expect.objectContaining({
      outputUriPrefix: 'gs://meu-bucket/diario/2026-08-22T05-30-00-000Z',
    }));
  });

  it('no dia 1 vai para a gaveta MENSAL — é o histórico longo', () => {
    expect(gavetaDe(DIA_PRIMEIRO)).toBe(GAVETAS.MENSAL);
    expect(gavetaDe(AGORA)).toBe(GAVETAS.DIARIO);
  });

  it('SEM bucket configurado, falha alto — backup que não acontece não pode ser silencioso', async () => {
    const cliente = criarCliente();
    const backup = criarServicoDeBackup({ cliente, projectId: 'proj', bucket: null });

    await expect(backup.exportarAgora(AGORA))
      .rejects.toMatchObject({ codigo: 'BUCKET_NAO_CONFIGURADO' });

    expect(cliente.exportDocuments).not.toHaveBeenCalled();
  });

  it('o nome da pasta não tem dois-pontos e ordena cronologicamente como texto', () => {
    expect(nomeDaPasta(AGORA)).not.toContain(':');
    const antes = nomeDaPasta(new Date('2026-08-21T23:00:00Z'));
    const depois = nomeDaPasta(new Date('2026-08-22T01:00:00Z'));
    expect([depois, antes].sort()).toEqual([antes, depois]);
  });
});

describe('listar', () => {
  it('agrupa por pasta, soma tamanho e conta arquivos', async () => {
    const { backup } = montar();

    const [b] = await backup.listar();

    expect(b.id).toBe('diario/2026-08-22T13-52-40-353Z');
    expect(b.arquivos).toBe(2);
    expect(b.bytes).toBe(50136);
    expect(b.gaveta).toBe('diario');
  });

  it('export SEM a marca de conclusão aparece como incompleto', async () => {
    const { backup } = montar({
      arquivos: [{ name: 'diario/2026-08-22T13-52-40-353Z/all_namespaces/all_kinds/output-0', size: 10 }],
    });

    const [b] = await backup.listar();

    // Um export interrompido que parecesse válido na tela seria a pior
    // mentira que este painel poderia contar.
    expect(b.completo).toBe(false);
  });

  it('mais novo primeiro', async () => {
    const { backup } = montar({
      arquivos: [
        { name: 'diario/antigo/x.overall_export_metadata', size: 1, timeCreated: '2026-08-01T00:00:00Z' },
        { name: 'diario/novo/x.overall_export_metadata', size: 1, timeCreated: '2026-08-22T00:00:00Z' },
      ],
    });

    expect((await backup.listar()).map((b) => b.id))
      .toEqual(['diario/novo', 'diario/antigo']);
  });
});

describe('agrupamento — um export é UM backup na tela', () => {
  // Bug real, achado rodando contra o bucket de produção em 22/08/2026: o
  // export gravado na RAIZ (antes das gavetas existirem) aparecia como DOIS
  // backups — um só com o metadado, outro só com os dados. A regra antiga
  // pegava "os dois primeiros segmentos", e as duas formas de caminho têm
  // profundidades diferentes.
  const LAYOUT_ANTIGO = [
    { name: '2026-08-22T13-52-40-353Z/2026-08-22T13-52-40-353Z.overall_export_metadata', size: 98 },
    { name: '2026-08-22T13-52-40-353Z/all_namespaces/all_kinds/output-0', size: 50038 },
    { name: '2026-08-22T13-52-40-353Z/all_namespaces/all_kinds/output-1', size: 272952 },
  ];

  it('export na raiz do bucket vira UM item, não dois', async () => {
    const { backup } = montar({ arquivos: LAYOUT_ANTIGO });

    const lista = await backup.listar();

    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe('2026-08-22T13-52-40-353Z');
    expect(lista[0].arquivos).toBe(3);
    expect(lista[0].completo).toBe(true);
    expect(lista[0].gaveta).toBe('avulso');
  });

  it('os dois layouts convivem sem se misturar', async () => {
    const { backup } = montar({
      arquivos: [
        ...LAYOUT_ANTIGO,
        { name: 'diario/2026-08-23T02-00-00-000Z/x.overall_export_metadata', size: 98, timeCreated: '2026-08-23T02:00:00Z' },
        { name: 'diario/2026-08-23T02-00-00-000Z/all_namespaces/all_kinds/output-0', size: 10, timeCreated: '2026-08-23T02:00:00Z' },
      ],
    });

    const lista = await backup.listar();

    expect(lista.map((b) => b.id)).toEqual([
      'diario/2026-08-23T02-00-00-000Z',
      '2026-08-22T13-52-40-353Z',
    ]);
    expect(lista[0].gaveta).toBe('diario');
  });

  it('raizDoExport reconhece as duas formas de caminho', () => {
    expect(raizDoExport('diario/carimbo/all_namespaces/all_kinds/output-0')).toBe('diario/carimbo');
    expect(raizDoExport('carimbo/all_namespaces/all_kinds/output-0')).toBe('carimbo');
    expect(raizDoExport('diario/carimbo/x.overall_export_metadata')).toBe('diario/carimbo');
    expect(raizDoExport('carimbo/x.overall_export_metadata')).toBe('carimbo');
  });
});

describe('baixar', () => {
  it('empacota o backup num zip com o nome da pasta', async () => {
    const { backup } = montar();

    const r = await backup.baixar('diario/2026-08-22T13-52-40-353Z');

    expect(r.nome).toBe('diario_2026-08-22T13-52-40-353Z.zip');
    expect(Buffer.isBuffer(r.conteudo)).toBe(true);
    expect(r.conteudo.length).toBeGreaterThan(0);
  });

  it('404 em backup que não existe', async () => {
    const { backup } = montar();

    await expect(backup.baixar('diario/nao-existe'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('backup gigante manda usar o gcloud em vez de derrubar a function', async () => {
    const { backup } = montar({
      arquivos: [{ name: 'diario/grande/x.overall_export_metadata', size: 200 * 1024 * 1024 }],
    });

    await expect(backup.baixar('diario/grande'))
      .rejects.toMatchObject({ statusCode: 413, codigo: 'BACKUP_GRANDE_DEMAIS' });
  });
});

describe('restaurar — a ação mais perigosa do sistema', () => {
  const ID = 'diario/2026-08-22T13-52-40-353Z';

  it('restaura e devolve a operação', async () => {
    const { backup, cliente } = montar();

    const r = await backup.restaurar(ID, { senha: SENHA, confirmacao: ID });

    expect(r.restaurado).toBe(ID);
    expect(cliente.importDocuments).toHaveBeenCalledWith(expect.objectContaining({
      inputUriPrefix: `gs://meu-bucket/${ID}`,
    }));
  });

  it('faz um backup de SEGURANÇA do estado atual ANTES de sobrescrever', async () => {
    const { backup, cliente } = montar();

    const r = await backup.restaurar(ID, { senha: SENHA, confirmacao: ID });

    // Sem esta rede, restaurar por engano seria irreversível.
    expect(cliente.exportDocuments).toHaveBeenCalled();
    expect(r.backupDeSeguranca).toBe('mensal/2026-08-22T05-30-00-000Z');

    const ordemExport = cliente.exportDocuments.mock.invocationCallOrder[0];
    const ordemImport = cliente.importDocuments.mock.invocationCallOrder[0];
    expect(ordemExport).toBeLessThan(ordemImport);
  });

  it('o backup de segurança vai para a gaveta MENSAL — não pode sumir em 30 dias', async () => {
    const { backup } = montar();

    const r = await backup.restaurar(ID, { senha: SENHA, confirmacao: ID });

    expect(r.backupDeSeguranca.startsWith('mensal/')).toBe(true);
  });

  it('senha errada NÃO restaura nada', async () => {
    const { backup, cliente } = montar();

    await expect(backup.restaurar(ID, { senha: 'chute', confirmacao: ID }))
      .rejects.toMatchObject({ statusCode: 403, codigo: 'SENHA_INCORRETA' });

    expect(cliente.importDocuments).not.toHaveBeenCalled();
    expect(cliente.exportDocuments).not.toHaveBeenCalled();
  });

  it('SEM senha configurada, restauração fica DESLIGADA', async () => {
    const { backup, cliente } = montar({ senha: null });

    await expect(backup.restaurar(ID, { senha: 'qualquer', confirmacao: ID }))
      .rejects.toMatchObject({ statusCode: 503, codigo: 'RESTAURACAO_DESLIGADA' });

    expect(cliente.importDocuments).not.toHaveBeenCalled();
  });

  it('confirmação que não bate com o backup escolhido recusa', async () => {
    const { backup, cliente } = montar();

    await expect(backup.restaurar(ID, { senha: SENHA, confirmacao: 'outro' }))
      .rejects.toMatchObject({ statusCode: 409, codigo: 'CONFIRMACAO_NAO_CONFERE' });

    expect(cliente.importDocuments).not.toHaveBeenCalled();
  });

  it('backup INCOMPLETO não pode ser restaurado — deixaria o banco pela metade', async () => {
    const { backup, cliente } = montar({
      arquivos: [{ name: 'diario/parcial/all_namespaces/all_kinds/output-0', size: 10 }],
    });

    await expect(backup.restaurar('diario/parcial', { senha: SENHA, confirmacao: 'diario/parcial' }))
      .rejects.toMatchObject({ codigo: 'BACKUP_INCOMPLETO' });

    expect(cliente.importDocuments).not.toHaveBeenCalled();
  });
});

describe('segredoConfere', () => {
  it('aceita igual e recusa diferente', () => {
    expect(segredoConfere('abc', 'abc')).toBe(true);
    expect(segredoConfere('abc', 'abd')).toBe(false);
  });

  it('recusa quando não há segredo configurado', () => {
    expect(segredoConfere('abc', null)).toBe(false);
    expect(segredoConfere('', '')).toBe(false);
  });

  it('compara entradas de tamanhos diferentes sem estourar', () => {
    // `timingSafeEqual` exige buffers do mesmo tamanho — por isso os dois
    // lados viram hash antes. Sem o hash, isto lançaria.
    expect(segredoConfere('curta', 'uma-senha-bem-mais-longa')).toBe(false);
  });
});
