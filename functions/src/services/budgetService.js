/**
 * Orçamento mensal por categoria.
 *
 * Um limite por categoria, que se repete todo mês (não um valor por
 * referenceMonth) — é assim que a pessoa pensa "gasto até R$500 em mercado",
 * não como um teto que precisa ser recadastrado mês a mês.
 *
 * `db` entra por parâmetro (fábrica), só para resolver nome/cor da categoria
 * por id — o resto da leitura e toda a escrita passam por `dados`
 * (escopoDe), que já é o dublê nos testes. Sem essa injeção o serviço
 * arrastaria o Firestore de produção sempre que precisasse enriquecer uma
 * lista, e a trava de `config/firebaseAdmin.js` derrubaria o teste.
 */

function criarServicoDeOrcamento({ db }) {
  async function enriquecer(budgets) {
    if (!budgets.length) return [];

    const ids = [...new Set(budgets.map((b) => b.categoryId).filter(Boolean))];
    const docs = ids.length ? await db.getAll(...ids.map((id) => db.collection('categories').doc(id))) : [];

    const categorias = {};
    docs.forEach((doc) => { if (doc.exists) categorias[doc.id] = { id: doc.id, ...doc.data() }; });

    return budgets.map((b) => ({
      ...b,
      category: categorias[b.categoryId] || { id: b.categoryId, name: 'Desconhecida', color: '#94a3b8' },
    }));
  }

  async function listBudgets(dados) {
    const snap = await dados.consultar('budgets').get();
    return enriquecer(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function validarCategoria(dados, categoryId) {
    if (categoryId === undefined) return;
    const categoria = await dados.buscarDoc('categories', categoryId);
    if (!categoria) throw Object.assign(new Error('Categoria inválida.'), { statusCode: 400 });
  }

  async function createBudget(dados, entrada) {
    await validarCategoria(dados, entrada.categoryId);

    const existente = await dados.consultar('budgets')
      .where('categoryId', '==', entrada.categoryId).limit(1).get();
    if (!existente.empty) {
      throw Object.assign(new Error('Já existe um orçamento para esta categoria.'), { statusCode: 409 });
    }

    const criado = await dados.criar('budgets', {
      categoryId: entrada.categoryId,
      monthlyLimitCents: entrada.monthlyLimitCents,
      active: entrada.active ?? true,
    });
    const [enriquecido] = await enriquecer([criado]);
    return enriquecido;
  }

  async function updateBudget(dados, budgetId, entrada) {
    const alteracao = {};
    if (entrada.categoryId !== undefined) alteracao.categoryId = entrada.categoryId;
    if (entrada.monthlyLimitCents !== undefined) alteracao.monthlyLimitCents = entrada.monthlyLimitCents;
    if (entrada.active !== undefined) alteracao.active = entrada.active;

    await validarCategoria(dados, entrada.categoryId);

    const atualizado = await dados.atualizar('budgets', budgetId, alteracao);
    const [enriquecido] = await enriquecer([atualizado]);
    return enriquecido;
  }

  async function deleteBudget(dados, budgetId) {
    await dados.remover('budgets', budgetId);
  }

  /**
   * Junta cada orçamento ativo com o que já foi gasto na categoria no mês,
   * para a barra de progresso e o alerta de estouro. Só considera lançamento
   * confirmado — pendente ou com erro não é gasto de verdade ainda.
   */
  async function resumoDoMes(dados, referenceMonth) {
    const [budgetsSnap, txSnap] = await Promise.all([
      dados.consultar('budgets').where('active', '==', true).get(),
      dados.consultar('transactions')
        .where('referenceMonth', '==', referenceMonth)
        .where('type', '==', 'EXPENSE')
        .get(),
    ]);

    const budgets = budgetsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!budgets.length) return [];

    const gastoPorCategoria = {};
    txSnap.docs.forEach((d) => {
      const t = d.data();
      if (t.status !== 'CONFIRMED') return;
      gastoPorCategoria[t.categoryId] = (gastoPorCategoria[t.categoryId] || 0) + Math.round(t.amount * 100);
    });

    const enriquecidos = await enriquecer(budgets);

    return enriquecidos
      .map((b) => {
        const spentCents = gastoPorCategoria[b.categoryId] || 0;
        const limitCents = b.monthlyLimitCents;
        const percentUsed = limitCents > 0 ? spentCents / limitCents : 0;
        return {
          id: b.id,
          categoryId: b.categoryId,
          categoryName: b.category?.name || 'Desconhecida',
          categoryColor: b.category?.color || '#94a3b8',
          limitCents,
          spentCents,
          percentUsed,
          estourado: spentCents > limitCents,
        };
      })
      .sort((a, b) => b.percentUsed - a.percentUsed);
  }

  return { listBudgets, createBudget, updateBudget, deleteBudget, resumoDoMes };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { db } = require('../config/firebaseAdmin');
    _padrao = criarServicoDeOrcamento({ db });
  }
  return _padrao;
}

module.exports = {
  criarServicoDeOrcamento,
  listBudgets: (...args) => servico().listBudgets(...args),
  createBudget: (...args) => servico().createBudget(...args),
  updateBudget: (...args) => servico().updateBudget(...args),
  deleteBudget: (...args) => servico().deleteBudget(...args),
  resumoDoMes: (...args) => servico().resumoDoMes(...args),
};
