const { normalizar } = require('../utils/normalizarTexto');

/**
 * O que a família já ensinou sobre uma descrição de gasto.
 *
 * Guarda três coisas por descrição, uma linha por descrição por família:
 *
 * - **quantas vezes** ela apareceu sem subcategoria — é o gatilho da oferta,
 *   que só acontece na segunda. Subcategoria serve para gasto que se repete;
 *   gasto avulso não merece uma, e perguntar sobre ele é ruído.
 * - **a subcategoria aprendida**, depois que a pessoa aceita criar. É isto que
 *   faz o próximo lançamento ir direto para o lugar certo mesmo quando o nome
 *   escolhido não aparece na frase: quem batiza "ração cachorro" de *Pet* não
 *   escreve "pet" na mensagem seguinte, então casar por nome não bastaria.
 * - **a recusa**, para nunca mais oferecer aquilo. Sem isso a pergunta voltaria
 *   em todo lançamento repetido, que é o jeito mais rápido de fazer uma boa
 *   ideia virar irritação.
 *
 * O casamento é por descrição EXATA normalizada. "ração cachorro" e "ração do
 * cachorro" são entradas diferentes, de propósito: casar por semelhança juntaria
 * gastos que não são a mesma coisa, e nesse erro o custo é alto — o dinheiro
 * aparece na categoria errada e ninguém percebe.
 */

// A descrição vira parte do ID do documento, então precisa caber e não pode
// ter barra (o Firestore recusa "/" em ID).
const MAX_CHAVE = 120;

function chaveDe(descricao) {
  const limpa = normalizar(descricao).replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
  return limpa.slice(0, MAX_CHAVE).replace(/\s/g, '_');
}

function criarMemoriaDeDescricao({ escopoDe, admin }) {
  function docId(householdId, descricao) {
    // householdId no ID mantém a coleção plana e o documento único por família
    // sem depender de query — leitura por ID é a mais barata que existe.
    return `${householdId}__${chaveDe(descricao)}`;
  }

  /**
   * O que já se sabe sobre esta descrição.
   * @returns {{vezes: number, subcategoryId: string|null, recusada: boolean}|null}
   */
  async function consultar(householdId, descricao) {
    const chave = chaveDe(descricao);
    if (!chave) return null;

    const dados = escopoDe(householdId);
    const doc = await dados.buscarDoc('memoriaDeDescricao', docId(householdId, descricao));
    if (!doc) return null;

    return {
      vezes: doc.vezes || 0,
      subcategoryId: doc.subcategoryId || null,
      categoryId: doc.categoryId || null,
      recusada: !!doc.recusada,
      descricao: doc.descricao || descricao,
    };
  }

  /**
   * Marca mais uma aparição da descrição SEM subcategoria.
   *
   * Só é chamado quando o lançamento ficou sem subcategoria — quando já tem,
   * não há o que sugerir e a escrita seria desperdício.
   *
   * @returns {number} quantas vezes a descrição já apareceu, contando esta.
   */
  async function registrarAparicao(householdId, descricao, categoryId) {
    const chave = chaveDe(descricao);
    if (!chave) return 0;

    const id = docId(householdId, descricao);
    const dados = escopoDe(householdId);
    const atual = await dados.buscarDoc('memoriaDeDescricao', id);

    if (!atual) {
      await dados.criarComId('memoriaDeDescricao', id, {
        descricao: String(descricao).trim(),
        chave,
        vezes: 1,
        categoryId: categoryId || null,
        subcategoryId: null,
        recusada: false,
      });
      return 1;
    }

    const vezes = (atual.vezes || 0) + 1;
    await dados.atualizar('memoriaDeDescricao', id, {
      vezes,
      categoryId: categoryId || atual.categoryId || null,
      // A descrição mais recente vence: é como a pessoa escreve hoje.
      descricao: String(descricao).trim(),
    });
    return vezes;
  }

  /** A pessoa aceitou criar: guarda o vínculo para os próximos lançamentos. */
  async function aprender(householdId, descricao, { subcategoryId, categoryId }) {
    const id = docId(householdId, descricao);
    const dados = escopoDe(householdId);
    const atual = await dados.buscarDoc('memoriaDeDescricao', id);

    const conteudo = {
      subcategoryId,
      categoryId: categoryId || null,
      recusada: false,
    };

    if (!atual) {
      await dados.criarComId('memoriaDeDescricao', id, {
        descricao: String(descricao).trim(),
        chave: chaveDe(descricao),
        vezes: 1,
        ...conteudo,
      });
      return;
    }

    await dados.atualizar('memoriaDeDescricao', id, conteudo);
  }

  /** A pessoa disse não: não oferecer mais para esta descrição. */
  async function recusar(householdId, descricao) {
    const id = docId(householdId, descricao);
    const dados = escopoDe(householdId);
    const atual = await dados.buscarDoc('memoriaDeDescricao', id);

    if (!atual) {
      await dados.criarComId('memoriaDeDescricao', id, {
        descricao: String(descricao).trim(),
        chave: chaveDe(descricao),
        vezes: 1,
        subcategoryId: null,
        categoryId: null,
        recusada: true,
      });
      return;
    }

    await dados.atualizar('memoriaDeDescricao', id, { recusada: true });
  }

  return { consultar, registrarAparicao, aprender, recusar, chaveDe };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { escopoDe } = require('../data/escopo');
    const { admin } = require('../config/firebaseAdmin');
    _padrao = criarMemoriaDeDescricao({ escopoDe, admin });
  }
  return _padrao;
}

module.exports = {
  criarMemoriaDeDescricao,
  chaveDe,
  consultar: (...a) => servico().consultar(...a),
  registrarAparicao: (...a) => servico().registrarAparicao(...a),
  aprender: (...a) => servico().aprender(...a),
  recusar: (...a) => servico().recusar(...a),
};
