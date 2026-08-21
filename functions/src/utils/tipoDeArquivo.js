/**
 * Que tipo de arquivo é este, de verdade?
 *
 * Extensão e `Content-Type` são texto escolhido por quem envia. Um `.png` com
 * um executável dentro chega aqui como `image/png` e o navegador de quem abrir
 * decide o que fazer com o conteúdo real, não com o rótulo. A única resposta
 * confiável está nos primeiros bytes do próprio arquivo.
 *
 * Sem dependência nova: são oito bytes de comparação. `file-type` e afins
 * reconhecem centenas de formatos, e aqui só três são aceitos — o resto do
 * pacote seria superfície a mais no container por nada.
 *
 * A lista é do que é ACEITO, nunca do que é proibido. Lista de proibidos
 * depende de alguém ter previsto o formato perigoso; lista de aceitos falha
 * para o lado seguro sozinha (mesma lição da armadilha das palavras-chave).
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PDF = Buffer.from('%PDF-', 'ascii');

const TIPOS = [
  { mime: 'image/png', extensao: 'png', assinatura: PNG },
  { mime: 'image/jpeg', extensao: 'jpg', assinatura: JPEG },
  { mime: 'application/pdf', extensao: 'pdf', assinatura: PDF },
];

const MIMES_ACEITOS = TIPOS.map((t) => t.mime);

/**
 * Devolve `{ mime, extensao }` do conteúdo, ou `null` quando não é nenhum dos
 * três aceitos. Buffer curto demais também devolve `null` — arquivo com menos
 * bytes que a assinatura não é um arquivo válido de nenhum desses formatos.
 */
function detectarTipo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  for (const tipo of TIPOS) {
    if (buffer.length < tipo.assinatura.length) continue;
    if (buffer.subarray(0, tipo.assinatura.length).equals(tipo.assinatura)) {
      return { mime: tipo.mime, extensao: tipo.extensao };
    }
  }

  return null;
}

/**
 * O que o cliente disse bate com o que o arquivo é?
 *
 * Usado só para explicar a recusa. Quem decide o `mimeType` gravado é sempre o
 * `detectarTipo` — o rótulo do cliente nunca é copiado para o metadado.
 */
function extensaoDeclarada(nomeOriginal) {
  const m = /\.([a-z0-9]+)$/i.exec(String(nomeOriginal || '').trim());
  return m ? m[1].toLowerCase() : null;
}

module.exports = { detectarTipo, extensaoDeclarada, MIMES_ACEITOS, TIPOS };
