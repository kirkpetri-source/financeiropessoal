/**
 * Anexos de chamado — upload, leitura e exclusão.
 *
 * Três decisões que mandam no arquivo inteiro:
 *
 * 1. **Bucket dedicado, em São Paulo.** Não é o bucket padrão do projeto, que
 *    nasceu em US-EAST1 nos dois ambientes. A Política de Privacidade publicada
 *    promete `southamerica-east1`, e anexo de chamado é print de extrato e
 *    comprovante — dado financeiro. O bucket também NÃO é registrado no
 *    Firebase Storage, então o SDK do navegador não tem caminho até ele: o
 *    único acesso é o Admin SDK, daqui.
 *
 * 2. **Nada do cliente vira caminho.** O nome interno é aleatório; o nome que a
 *    pessoa mandou fica só no metadado, para exibir. Aceitar o nome original no
 *    caminho traz `../`, colisão e nome com 300 caracteres de graça.
 *
 * 3. **Sem signed URL** (decisão do Kirk em 21/08/2026). O arquivo é lido aqui
 *    e devolvido pela API, autenticado pelo Bearer de sempre. `getSignedUrl`
 *    dentro de Cloud Functions v2 exige o papel Service Account Token Creator e
 *    falha em RUNTIME — e um teste local dá falso positivo, porque a chave JSON
 *    assina na máquina e a function no ar não tem chave nenhuma.
 */

const crypto = require('crypto');
const { detectarTipo, extensaoDeclarada } = require('../utils/tipoDeArquivo');
const { LIMITES } = require('../chamados/estado');

const PREFIXO = 'chamados';
const BASE64_VALIDO = /^[A-Za-z0-9+/]+={0,2}$/;

function erro(mensagem, statusCode, codigo) {
  return Object.assign(new Error(mensagem), { statusCode, codigo });
}

/** Pasta da família. É o prefixo que a exclusão da LGPD varre. */
function pastaDaFamilia(householdId) {
  return `${PREFIXO}/${householdId}/`;
}

/**
 * Nome que vai para a tela e para o `Content-Disposition`.
 *
 * Tira barra, contrabarra e QUEBRA DE LINHA. As duas primeiras porque o nome
 * nunca deve poder parecer um caminho; a terceira porque o nome viaja num
 * cabeçalho HTTP na hora do download, e `\r\n` dentro de cabeçalho é injeção de
 * cabeçalho, não estética.
 */
function limparNome(nomeOriginal) {
  const limpo = String(nomeOriginal || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[/\\]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return limpo || 'arquivo';
}

function decodificar(conteudoBase64) {
  const limpo = String(conteudoBase64 || '').replace(/^data:[^;]+;base64,/, '').trim();

  if (!limpo) throw erro('Arquivo vazio.', 400, 'ARQUIVO_VAZIO');

  // `Buffer.from(x, 'base64')` NUNCA lança: ele descarta silenciosamente o que
  // não reconhece. Sem esta conferência, um corpo corrompido vira um arquivo
  // menor e plausível, gravado como se estivesse certo.
  if (!BASE64_VALIDO.test(limpo)) {
    throw erro('Conteúdo do arquivo inválido.', 400, 'BASE64_INVALIDO');
  }

  const buffer = Buffer.from(limpo, 'base64');
  if (buffer.length === 0) throw erro('Arquivo vazio.', 400, 'ARQUIVO_VAZIO');

  return buffer;
}

function criarAnexoService({ obterBucket }) {
  /**
   * Sobe um arquivo. Lança quando ele é inválido — quem chama decide se isso
   * derruba tudo ou vira uma linha em "falharam".
   */
  async function subirUm(householdId, { nomeOriginal, conteudo }) {
    const buffer = decodificar(conteudo);

    if (buffer.length > LIMITES.BYTES_POR_ANEXO) {
      const mb = (LIMITES.BYTES_POR_ANEXO / 1024 / 1024).toFixed(0);
      throw erro(`Arquivo acima de ${mb} MB.`, 400, 'ARQUIVO_GRANDE');
    }

    const tipo = detectarTipo(buffer);
    if (!tipo) {
      const declarada = extensaoDeclarada(nomeOriginal);
      throw erro(
        declarada
          ? `O arquivo não é um ${declarada.toUpperCase()} de verdade. Aceitamos PNG, JPG e PDF.`
          : 'Formato não aceito. Envie PNG, JPG ou PDF.',
        400, 'TIPO_NAO_ACEITO',
      );
    }

    const nome = limparNome(nomeOriginal);
    const storagePath = `${pastaDaFamilia(householdId)}${crypto.randomBytes(16).toString('hex')}.${tipo.extensao}`;

    await obterBucket().file(storagePath).save(buffer, {
      resumable: false,
      contentType: tipo.mime,
      metadata: {
        contentType: tipo.mime,
        // O nome de exibição mora aqui, e não no Firestore, para a leitura não
        // precisar do documento do chamado só para descobrir como se chama o
        // arquivo. `householdId` vai junto como conferência de segunda mão.
        metadata: { nomeOriginal: nome, householdId },
      },
    });

    return {
      storagePath,
      nomeOriginal: nome,
      mimeType: tipo.mime,
      tamanho: buffer.length,
    };
  }

  /**
   * Sobe vários e devolve o que deu certo E o que falhou.
   *
   * Não lança por causa de UM arquivo ruim: a mensagem que a pessoa escreveu
   * vale mais que o terceiro anexo dela. A tela mostra qual falhou e ela
   * reenvia só aquele.
   */
  async function subirArquivos(householdId, arquivos = []) {
    if (!Array.isArray(arquivos) || arquivos.length === 0) {
      throw erro('Nenhum arquivo enviado.', 400, 'SEM_ARQUIVO');
    }
    if (arquivos.length > LIMITES.ANEXOS_POR_MENSAGEM) {
      throw erro(
        `No máximo ${LIMITES.ANEXOS_POR_MENSAGEM} anexos por mensagem.`,
        400, 'ANEXOS_DEMAIS',
      );
    }

    const enviados = [];
    const falharam = [];

    for (const arquivo of arquivos) {
      try {
        enviados.push(await subirUm(householdId, arquivo));
      } catch (err) {
        falharam.push({
          nomeOriginal: limparNome(arquivo?.nomeOriginal),
          erro: err.message,
          codigo: err.codigo || 'FALHA_UPLOAD',
        });
      }
    }

    return { enviados, falharam };
  }

  /**
   * Transforma os caminhos que a mensagem cita em metadados confiáveis.
   *
   * Duas barreiras, e as duas importam:
   *
   *   - o caminho tem que estar DENTRO da pasta desta família. É o que impede
   *     alguém de citar `chamados/<outra-familia>/arquivo.png` no corpo da
   *     mensagem e passar a enxergá-lo pela tela do próprio chamado;
   *   - o arquivo tem que EXISTIR. Sem isso, o documento gravado apontaria para
   *     coisa nenhuma, e a tela mostraria um anexo que não abre.
   *
   * Nada além do caminho vem do cliente: nome, tipo e tamanho são relidos do
   * próprio objeto no Storage.
   */
  async function metadadosDe(householdId, caminhos = []) {
    if (caminhos.length > LIMITES.ANEXOS_POR_MENSAGEM) {
      throw erro(
        `No máximo ${LIMITES.ANEXOS_POR_MENSAGEM} anexos por mensagem.`,
        400, 'ANEXOS_DEMAIS',
      );
    }

    const pasta = pastaDaFamilia(householdId);
    const metadados = [];

    for (const caminho of caminhos) {
      const limpo = String(caminho || '');

      // `startsWith` sozinho não basta: `chamados/fam-1/../fam-2/x` começa com
      // a pasta certa e aponta para outra. O caminho gerado aqui nunca tem
      // ponto, então qualquer um que tenha é forjado.
      if (!limpo.startsWith(pasta) || limpo.includes('..')) {
        throw erro('Anexo inválido.', 400, 'ANEXO_INVALIDO');
      }

      const arquivo = obterBucket().file(limpo);
      const [existe] = await arquivo.exists();
      if (!existe) throw erro('Anexo inválido.', 400, 'ANEXO_INVALIDO');

      const [meta] = await arquivo.getMetadata();

      metadados.push({
        id: crypto.randomUUID(),
        storagePath: limpo,
        nomeOriginal: meta?.metadata?.nomeOriginal || 'arquivo',
        mimeType: meta?.contentType || 'application/octet-stream',
        tamanho: Number(meta?.size) || 0,
      });
    }

    return metadados;
  }

  /**
   * Os bytes, para a API devolver.
   *
   * Quem chama já provou, pelo `escopoDe`, que o chamado é da família e que o
   * anexo está nele. A conferência do prefixo aqui é a segunda tranca: se algum
   * dia um caminho errado entrar num documento, ele ainda não sai daqui.
   */
  async function lerAnexo(householdId, storagePath) {
    const limpo = String(storagePath || '');
    if (!limpo.startsWith(pastaDaFamilia(householdId)) || limpo.includes('..')) {
      throw erro('Anexo não encontrado.', 404, 'ANEXO_NAO_ENCONTRADO');
    }

    const arquivo = obterBucket().file(limpo);
    const [existe] = await arquivo.exists();
    if (!existe) throw erro('Anexo não encontrado.', 404, 'ANEXO_NAO_ENCONTRADO');

    const [meta] = await arquivo.getMetadata();
    const [conteudo] = await arquivo.download();

    return {
      conteudo,
      mimeType: meta?.contentType || 'application/octet-stream',
      nomeOriginal: meta?.metadata?.nomeOriginal || 'arquivo',
      tamanho: conteudo.length,
    };
  }

  /**
   * Apaga tudo da família. Chamado pela exclusão da LGPD — sem isso, sobra
   * print de extrato de um cliente que pediu para sumir.
   */
  async function apagarDaFamilia(householdId) {
    await obterBucket().deleteFiles({ prefix: pastaDaFamilia(householdId) });
    return { prefixo: pastaDaFamilia(householdId) };
  }

  return { subirArquivos, subirUm, metadadosDe, lerAnexo, apagarDaFamilia };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { admin } = require('../config/firebaseAdmin');
    const nome = process.env.STORAGE_BUCKET_ANEXOS;

    if (!nome) {
      throw erro(
        'STORAGE_BUCKET_ANEXOS não configurado — anexos indisponíveis.',
        503, 'BUCKET_NAO_CONFIGURADO',
      );
    }

    _padrao = criarAnexoService({ obterBucket: () => admin.storage().bucket(nome) });
  }
  return _padrao;
}

module.exports = {
  criarAnexoService,
  pastaDaFamilia,
  limparNome,
  subirArquivos: (...a) => servico().subirArquivos(...a),
  metadadosDe: (...a) => servico().metadadosDe(...a),
  lerAnexo: (...a) => servico().lerAnexo(...a),
  apagarDaFamilia: (...a) => servico().apagarDaFamilia(...a),
};
