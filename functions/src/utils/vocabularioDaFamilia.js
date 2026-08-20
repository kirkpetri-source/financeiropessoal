const { normalizar } = require('./normalizarTexto');

/**
 * A mensagem cita, com todas as letras, uma categoria ou subcategoria que a
 * família cadastrou?
 *
 * Função PURA — recebe o vocabulário pronto, não vai ao banco.
 *
 * POR QUE ISTO EXISTE
 *
 * O parser de lançamento resolve CATEGORIA e nunca via as subcategorias. Como
 * "Padaria" e "Açougue" existem só como subcategoria de Mercado, quem escrevia
 * "gastei 45 na padaria" caía no palpite da IA — que mandava para
 * "Alimentação" ou "Outros", nunca para Mercado > Padaria. Reproduzido contra
 * o banco real em 20/08/2026, depois de usuários relatarem em produção que
 * lançamento de subcategoria "some" em Outros.
 *
 * Menção explícita vence palpite. Se a pessoa escreveu o nome que ELA
 * cadastrou, não há o que adivinhar nem o que perguntar.
 *
 * O casamento é por PALAVRA INTEIRA e pelo nome real vindo do banco. As duas
 * coisas são cicatriz: `contemPalavra` existe porque "net" casava dentro de
 * "netflix" e "posto" dentro de "impostos"; e o nome vem do banco porque lista
 * fixa de palavras-chave (`CATEGORY_MAP`) já envelheceu mal neste projeto.
 */

/** O termo aparece como palavra inteira no texto? */
function citaTermo(textoNormalizado, termo) {
  const alvo = normalizar(termo);
  if (!alvo || alvo.length < 3) return false;

  const escapado = alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Aceita plural simples: "padarias" casa com "Padaria".
  return new RegExp(`(^|\\s)${escapado}s?(\\s|$)`).test(textoNormalizado);
}

/**
 * Procura menção explícita, subcategoria primeiro.
 *
 * A ordem importa: a subcategoria é mais específica, e quem escreve "padaria"
 * está sendo mais preciso do que quem escreve "mercado". Entre nomes de mesmo
 * nível, o mais longo vence — "Cartão de Crédito" antes de "Cartão".
 *
 * @param {string} texto mensagem ou descrição do lançamento
 * @param {{categorias: Array<{id,name}>, subcategorias: Array<{id,name,categoryId}>}} vocabulario
 * @returns {{subcategoria: object|null, categoria: object|null}}
 */
function identificarNoVocabulario(texto, vocabulario = {}) {
  const limpo = normalizar(texto).replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  const vazio = { subcategoria: null, categoria: null };
  if (!limpo) return vazio;

  const subcategorias = [...(vocabulario.subcategorias || [])]
    .filter((s) => s && s.name)
    .sort((a, b) => b.name.length - a.name.length);

  for (const sub of subcategorias) {
    if (citaTermo(limpo, sub.name)) {
      const mae = (vocabulario.categorias || []).find((c) => c.id === sub.categoryId) || null;
      // Subcategoria órfã (categoria-mãe apagada) não serve para lançar: sem a
      // mãe não há categoria, e transação sem categoria não existe no modelo.
      if (!mae) continue;
      return { subcategoria: sub, categoria: mae };
    }
  }

  const categorias = [...(vocabulario.categorias || [])]
    .filter((c) => c && c.name)
    .sort((a, b) => b.name.length - a.name.length);

  for (const cat of categorias) {
    if (citaTermo(limpo, cat.name)) return { subcategoria: null, categoria: cat };
  }

  return vazio;
}

module.exports = { identificarNoVocabulario, citaTermo };
