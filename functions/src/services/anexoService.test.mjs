import { describe, it, expect, beforeEach } from 'vitest';
import { criarAnexoService, pastaDaFamilia, limparNome } from './anexoService.js';
import { LIMITES } from '../chamados/estado.js';

const FAMILIA_A = 'fam-A';
const FAMILIA_B = 'fam-B';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('conteúdo de imagem'),
]);
const PDF = Buffer.from('%PDF-1.7\nextrato bancário\n');
const EXECUTAVEL = Buffer.from('MZ\x90\x00 isto é um programa');

const base64 = (buffer) => buffer.toString('base64');

/** Bucket em memória, com o suficiente da API do Cloud Storage. */
function criarBucketFalso() {
  const arquivos = new Map();

  const bucket = {
    arquivos,
    file(caminho) {
      return {
        name: caminho,
        async save(buffer, opcoes) {
          arquivos.set(caminho, { buffer, opcoes });
        },
        async exists() { return [arquivos.has(caminho)]; },
        async getMetadata() {
          const a = arquivos.get(caminho);
          if (!a) throw new Error('não existe');
          return [{
            contentType: a.opcoes.contentType,
            size: String(a.buffer.length),
            metadata: a.opcoes.metadata?.metadata,
          }];
        },
        async download() { return [arquivos.get(caminho).buffer]; },
      };
    },
    async deleteFiles({ prefix }) {
      for (const chave of [...arquivos.keys()]) {
        if (chave.startsWith(prefix)) arquivos.delete(chave);
      }
    },
  };

  return bucket;
}

let bucket;
let servico;

beforeEach(() => {
  bucket = criarBucketFalso();
  servico = criarAnexoService({ obterBucket: () => bucket });
});

describe('subirArquivos — o que é aceito', () => {
  it('sobe PNG e devolve os metadados', async () => {
    const { enviados, falharam } = await servico.subirArquivos(FAMILIA_A, [
      { nomeOriginal: 'print.png', conteudo: base64(PNG) },
    ]);

    expect(falharam).toEqual([]);
    expect(enviados[0]).toMatchObject({
      nomeOriginal: 'print.png', mimeType: 'image/png', tamanho: PNG.length,
    });
  });

  it('grava dentro da pasta da família', async () => {
    const { enviados } = await servico.subirArquivos(FAMILIA_A, [
      { nomeOriginal: 'print.png', conteudo: base64(PNG) },
    ]);

    expect(enviados[0].storagePath.startsWith(pastaDaFamilia(FAMILIA_A))).toBe(true);
  });

  it('o nome interno é aleatório — o do cliente não vira caminho', async () => {
    const { enviados } = await servico.subirArquivos(FAMILIA_A, [
      { nomeOriginal: '../../outra-familia/roubado.png', conteudo: base64(PNG) },
    ]);

    expect(enviados[0].storagePath).not.toContain('roubado');
    expect(enviados[0].storagePath).not.toContain('..');
    expect(enviados[0].storagePath).toMatch(/^chamados\/fam-A\/[0-9a-f]{32}\.png$/);
  });

  it('dois arquivos com o mesmo nome não colidem', async () => {
    const { enviados } = await servico.subirArquivos(FAMILIA_A, [
      { nomeOriginal: 'print.png', conteudo: base64(PNG) },
      { nomeOriginal: 'print.png', conteudo: base64(PNG) },
    ]);

    expect(enviados[0].storagePath).not.toBe(enviados[1].storagePath);
    expect(bucket.arquivos.size).toBe(2);
  });

  it('aceita data URI do navegador', async () => {
    const { enviados, falharam } = await servico.subirArquivos(FAMILIA_A, [
      { nomeOriginal: 'print.png', conteudo: `data:image/png;base64,${base64(PNG)}` },
    ]);

    expect(falharam).toEqual([]);
    expect(enviados[0].mimeType).toBe('image/png');
  });

  it('o tipo gravado vem do conteúdo, não do que o cliente disse', async () => {
    const { enviados } = await servico.subirArquivos(FAMILIA_A, [
      { nomeOriginal: 'extrato.png', conteudo: base64(PDF) },
    ]);

    expect(enviados[0].mimeType).toBe('application/pdf');
    expect(enviados[0].storagePath.endsWith('.pdf')).toBe(true);
  });
});

describe('subirArquivos — o que é recusado', () => {
  it('recusa arquivo acima do limite', async () => {
    const gigante = Buffer.concat([PNG, Buffer.alloc(LIMITES.BYTES_POR_ANEXO)]);

    const { enviados, falharam } = await servico.subirArquivos(FAMILIA_A, [
      { nomeOriginal: 'enorme.png', conteudo: base64(gigante) },
    ]);

    expect(enviados).toEqual([]);
    expect(falharam[0].codigo).toBe('ARQUIVO_GRANDE');
    expect(bucket.arquivos.size).toBe(0);
  });

  it('recusa executável disfarçado de imagem', async () => {
    const { enviados, falharam } = await servico.subirArquivos(FAMILIA_A, [
      { nomeOriginal: 'foto.png', conteudo: base64(EXECUTAVEL) },
    ]);

    expect(enviados).toEqual([]);
    expect(falharam[0].codigo).toBe('TIPO_NAO_ACEITO');
    expect(falharam[0].erro).toMatch(/não é um PNG de verdade/);
  });

  it('recusa base64 corrompido em vez de gravar um arquivo menor', async () => {
    // Buffer.from(x, 'base64') não lança: descarta o que não reconhece. Sem a
    // conferência, isto viraria um arquivo plausível e errado.
    const { falharam } = await servico.subirArquivos(FAMILIA_A, [
      { nomeOriginal: 'x.png', conteudo: 'não###é@@base64!!!' },
    ]);

    expect(falharam[0].codigo).toBe('BASE64_INVALIDO');
  });

  it('recusa conteúdo vazio', async () => {
    const { falharam } = await servico.subirArquivos(FAMILIA_A, [
      { nomeOriginal: 'vazio.png', conteudo: '' },
    ]);

    expect(falharam[0].codigo).toBe('ARQUIVO_VAZIO');
  });

  it('recusa a requisição inteira quando vêm anexos demais', async () => {
    const muitos = Array.from({ length: LIMITES.ANEXOS_POR_MENSAGEM + 1 }, () => ({
      nomeOriginal: 'p.png', conteudo: base64(PNG),
    }));

    await expect(servico.subirArquivos(FAMILIA_A, muitos))
      .rejects.toMatchObject({ codigo: 'ANEXOS_DEMAIS' });
  });

  it('recusa lista vazia', async () => {
    await expect(servico.subirArquivos(FAMILIA_A, []))
      .rejects.toMatchObject({ codigo: 'SEM_ARQUIVO' });
  });
});

describe('subirArquivos — falha parcial', () => {
  it('um arquivo ruim não derruba os bons', async () => {
    const { enviados, falharam } = await servico.subirArquivos(FAMILIA_A, [
      { nomeOriginal: 'bom.png', conteudo: base64(PNG) },
      { nomeOriginal: 'ruim.png', conteudo: base64(EXECUTAVEL) },
      { nomeOriginal: 'extrato.pdf', conteudo: base64(PDF) },
    ]);

    expect(enviados).toHaveLength(2);
    expect(falharam).toHaveLength(1);
    expect(falharam[0].nomeOriginal).toBe('ruim.png');
    expect(bucket.arquivos.size).toBe(2);
  });
});

describe('metadadosDe — o que a mensagem pode citar', () => {
  async function subirUmPng(familia = FAMILIA_A) {
    const { enviados } = await servico.subirArquivos(familia, [
      { nomeOriginal: 'print.png', conteudo: base64(PNG) },
    ]);
    return enviados[0].storagePath;
  }

  it('relê nome, tipo e tamanho do próprio objeto no Storage', async () => {
    const caminho = await subirUmPng();

    const [meta] = await servico.metadadosDe(FAMILIA_A, [caminho]);

    expect(meta).toMatchObject({
      storagePath: caminho, nomeOriginal: 'print.png',
      mimeType: 'image/png', tamanho: PNG.length,
    });
    expect(meta.id).toBeTruthy();
  });

  it('recusa caminho de OUTRA família', async () => {
    const daOutra = await subirUmPng(FAMILIA_B);

    await expect(servico.metadadosDe(FAMILIA_A, [daOutra]))
      .rejects.toMatchObject({ codigo: 'ANEXO_INVALIDO' });
  });

  it('recusa travessia de diretório que começa com a pasta certa', async () => {
    const forjado = `${pastaDaFamilia(FAMILIA_A)}../${FAMILIA_B}/x.png`;

    await expect(servico.metadadosDe(FAMILIA_A, [forjado]))
      .rejects.toMatchObject({ codigo: 'ANEXO_INVALIDO' });
  });

  it('recusa caminho que não existe no Storage', async () => {
    const inventado = `${pastaDaFamilia(FAMILIA_A)}${'a'.repeat(32)}.png`;

    await expect(servico.metadadosDe(FAMILIA_A, [inventado]))
      .rejects.toMatchObject({ codigo: 'ANEXO_INVALIDO' });
  });

  it('cada citação ganha um id próprio', async () => {
    const caminho = await subirUmPng();

    const [a] = await servico.metadadosDe(FAMILIA_A, [caminho]);
    const [b] = await servico.metadadosDe(FAMILIA_A, [caminho]);

    expect(a.id).not.toBe(b.id);
  });
});

describe('lerAnexo', () => {
  it('devolve os bytes e o tipo', async () => {
    const { enviados } = await servico.subirArquivos(FAMILIA_A, [
      { nomeOriginal: 'extrato.pdf', conteudo: base64(PDF) },
    ]);

    const lido = await servico.lerAnexo(FAMILIA_A, enviados[0].storagePath);

    expect(lido.conteudo.equals(PDF)).toBe(true);
    expect(lido.mimeType).toBe('application/pdf');
    expect(lido.nomeOriginal).toBe('extrato.pdf');
  });

  it('recusa ler arquivo de outra família, mesmo com o caminho na mão', async () => {
    const { enviados } = await servico.subirArquivos(FAMILIA_B, [
      { nomeOriginal: 'da-B.png', conteudo: base64(PNG) },
    ]);

    await expect(servico.lerAnexo(FAMILIA_A, enviados[0].storagePath))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('arquivo inexistente e arquivo alheio dão a MESMA resposta', async () => {
    const { enviados } = await servico.subirArquivos(FAMILIA_B, [
      { nomeOriginal: 'da-B.png', conteudo: base64(PNG) },
    ]);

    const alheio = await servico.lerAnexo(FAMILIA_A, enviados[0].storagePath)
      .catch((e) => ({ statusCode: e.statusCode, message: e.message }));
    const inexistente = await servico.lerAnexo(FAMILIA_A, `${pastaDaFamilia(FAMILIA_A)}x.png`)
      .catch((e) => ({ statusCode: e.statusCode, message: e.message }));

    expect(alheio).toEqual(inexistente);
  });
});

describe('apagarDaFamilia', () => {
  it('apaga só a pasta da família pedida', async () => {
    await servico.subirArquivos(FAMILIA_A, [{ nomeOriginal: 'a.png', conteudo: base64(PNG) }]);
    await servico.subirArquivos(FAMILIA_B, [{ nomeOriginal: 'b.png', conteudo: base64(PNG) }]);

    await servico.apagarDaFamilia(FAMILIA_A);

    const restantes = [...bucket.arquivos.keys()];
    expect(restantes).toHaveLength(1);
    expect(restantes[0].startsWith(pastaDaFamilia(FAMILIA_B))).toBe(true);
  });
});

describe('limparNome', () => {
  it('tira quebra de linha — o nome vai num cabeçalho HTTP no download', () => {
    expect(limparNome('extrato\r\nX-Coisa: injetada.pdf')).toBe('extrato X-Coisa: injetada.pdf');
  });

  it('tira barra e contrabarra', () => {
    expect(limparNome('../../etc/passwd')).toBe('..-..-etc-passwd');
  });

  it('nunca devolve vazio', () => {
    expect(limparNome('   ')).toBe('arquivo');
    expect(limparNome(null)).toBe('arquivo');
  });
});
