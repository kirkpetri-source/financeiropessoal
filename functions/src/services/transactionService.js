const { format } = require('date-fns');

/**
 * Lançamentos financeiros, sempre no escopo de uma família.
 *
 * Todas as funções recebem `dados` — o acessor devolvido por escopoDe(householdId).
 * Nenhuma monta query própria para as coleções da família, justamente para que
 * não exista caminho sem o filtro do tenant.
 *
 * `db`/`admin` entram por parâmetro (fábrica) pelo mesmo motivo de
 * `budgetService.js`/`recurringBillService.js`: um require direto de
 * `config/firebaseAdmin` arrastaria o Firestore de produção para dentro do
 * teste, que a trava de `firebaseAdmin.js` recusa sob VITEST sem emulador.
 */

function mesDeReferencia(dataStr) {
  return format(new Date(dataStr), 'yyyy-MM');
}

function comDataConvertida(doc) {
  const d = doc.data ? doc.data() : doc;
  return { id: doc.id, ...d, date: d.date?.toDate?.() || d.date };
}

function criarServicoDeTransacoes({ db, admin }) {
  /**
   * Confere que categoryId/paymentMethodId (quando presentes) são da própria
   * família ou registro padrão — sem isso, um ID Firestore de outra família
   * gravava normalmente e o enriquecimento exibia nome/cor de categoria alheia.
   */
  async function validarReferencias(dados, { categoryId, subcategoryId, paymentMethodId }, categoriaEfetiva) {
    if (categoryId !== undefined) {
      const categoria = await dados.buscarDoc('categories', categoryId);
      if (!categoria) throw Object.assign(new Error('Categoria inválida.'), { statusCode: 400 });
    }
    if (paymentMethodId !== undefined) {
      const forma = await dados.buscarDoc('paymentMethods', paymentMethodId);
      if (!forma) throw Object.assign(new Error('Forma de pagamento inválida.'), { statusCode: 400 });
    }
    if (subcategoryId !== undefined && subcategoryId !== null) {
      const subcategoria = await dados.buscarDoc('subcategories', subcategoryId);
      if (!subcategoria) throw Object.assign(new Error('Subcategoria inválida.'), { statusCode: 400 });

      const categoriaAlvo = categoryId !== undefined ? categoryId : categoriaEfetiva;
      if (subcategoria.categoryId !== categoriaAlvo) {
        throw Object.assign(new Error('Subcategoria não pertence à categoria informada.'), { statusCode: 400 });
      }
    }
  }

  async function listTransactions(dados, filtros = {}) {
    const { month, type, categoryId, paymentMethodId, origin, paidBy } = filtros;

    let query = dados.consultar('transactions');
    if (month) query = query.where('referenceMonth', '==', month);
    if (type) query = query.where('type', '==', type);

    const snap = await query.orderBy('date', 'desc').get();
    let resultado = snap.docs.map(comDataConvertida);

    // Filtros de baixa cardinalidade ficam em memória de propósito: cada
    // combinação viraria um índice composto no Firestore, e o volume por família
    // e por mês é pequeno.
    if (categoryId) resultado = resultado.filter((t) => t.categoryId === categoryId);
    if (paymentMethodId) resultado = resultado.filter((t) => t.paymentMethodId === paymentMethodId);
    if (origin) resultado = resultado.filter((t) => t.origin === origin);
    if (paidBy) resultado = resultado.filter((t) => t.paidBy?.toLowerCase() === paidBy.toLowerCase());

    return enriquecer(resultado);
  }

  async function createTransaction(dados, entrada, criadoPor = null) {
    await validarReferencias(dados, {
      categoryId: entrada.categoryId,
      subcategoryId: entrada.subcategoryId,
      paymentMethodId: entrada.paymentMethodId,
    }, entrada.categoryId);

    const criada = await dados.criar('transactions', {
      type: entrada.type,
      description: entrada.description,
      amount: Number(entrada.amount),
      categoryId: entrada.categoryId,
      subcategoryId: entrada.subcategoryId || null,
      paymentMethodId: entrada.paymentMethodId,
      date: admin.firestore.Timestamp.fromDate(new Date(entrada.date)),
      referenceMonth: mesDeReferencia(entrada.date),
      notes: entrada.notes || null,
      origin: entrada.origin || 'MANUAL',
      status: entrada.status || 'CONFIRMED',
      paidBy: entrada.paidBy || null,
      // Quem registrou. O lançamento pertence à família; isto é só rastreabilidade.
      createdBy: criadoPor,
      // Parcelamento: presentes só quando a compra foi dividida em Nx.
      parcela: entrada.parcela || null,
      totalParcelas: entrada.totalParcelas || null,
      grupoParcelamento: entrada.grupoParcelamento || null,
      valorTotalParcelamento: entrada.valorTotalParcelamento || null,
    });

    const lista = await enriquecer([{ ...criada, date: criada.date?.toDate?.() || criada.date }]);
    return lista[0];
  }

  async function updateTransaction(dados, transactionId, entrada) {
    const alteracao = {};

    const camposDiretos = ['type', 'description', 'categoryId', 'subcategoryId', 'paymentMethodId', 'notes', 'origin', 'status', 'paidBy'];
    for (const campo of camposDiretos) {
      if (entrada[campo] !== undefined) alteracao[campo] = entrada[campo];
    }
    if (entrada.amount !== undefined) alteracao.amount = Number(entrada.amount);
    if (entrada.date !== undefined) {
      alteracao.date = admin.firestore.Timestamp.fromDate(new Date(entrada.date));
      alteracao.referenceMonth = mesDeReferencia(entrada.date);
    }

    // Subcategoria só valida contra a categoria-mãe se a mensagem não trouxe
    // categoryId novo — nesse caso a categoria efetiva é a que já está gravada.
    let categoriaEfetiva = entrada.categoryId;
    if (categoriaEfetiva === undefined && entrada.subcategoryId !== undefined && entrada.subcategoryId !== null) {
      const atual = await dados.buscarDoc('transactions', transactionId);
      categoriaEfetiva = atual?.categoryId;
    }

    await validarReferencias(dados, {
      categoryId: entrada.categoryId,
      subcategoryId: entrada.subcategoryId,
      paymentMethodId: entrada.paymentMethodId,
    }, categoriaEfetiva);

    const atualizada = await dados.atualizar('transactions', transactionId, alteracao);
    const lista = await enriquecer([{ ...atualizada, date: atualizada.date?.toDate?.() || atualizada.date }]);
    return lista[0];
  }

  async function deleteTransaction(dados, transactionId) {
    await dados.remover('transactions', transactionId);
  }

  async function getMonthlySummary(dados, month, filtroPagador = null) {
    const snap = await dados.consultar('transactions')
      .where('referenceMonth', '==', month)
      .get();

    const todas = await enriquecer(snap.docs.map(comDataConvertida));

    // O breakdown por pessoa considera o mês inteiro, mesmo quando há filtro —
    // é ele que alimenta os cartões de "Gastos por Pessoa" na tela.
    const porPagador = {};
    todas.filter((t) => t.status === 'CONFIRMED').forEach((t) => {
      const quem = t.paidBy || 'Sem identificação';
      if (!porPagador[quem]) porPagador[quem] = { name: quem, income: 0, expense: 0 };
      if (t.type === 'INCOME') porPagador[quem].income += t.amount;
      else porPagador[quem].expense += t.amount;
    });
    const byPayer = Object.values(porPagador).sort((a, b) => b.expense - a.expense);

    // O filtro por pessoa antes valia só para os totais: os gráficos continuavam
    // mostrando a família toda, e a tela ficava incoerente. Agora vale para tudo.
    const consideradas = filtroPagador
      ? todas.filter((t) => t.paidBy === filtroPagador)
      : todas;

    const confirmadas = consideradas.filter((t) => t.status === 'CONFIRMED');
    const totalIncome = confirmadas.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
    const totalExpense = confirmadas.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);

    const porCategoria = {};
    confirmadas.filter((t) => t.type === 'EXPENSE').forEach((t) => {
      const chave = t.category?.name || 'Outros';
      if (!porCategoria[chave]) {
        porCategoria[chave] = { name: chave, value: 0, color: t.category?.color || '#94a3b8', id: t.categoryId };
      }
      porCategoria[chave].value += t.amount;
    });
    const expenseByCategory = Object.values(porCategoria).sort((a, b) => b.value - a.value);

    // Só lançamentos confirmados na lista. Antes vinham pendentes e com erro
    // junto, e a lista não batia com os totais logo acima dela.
    const recentTransactions = [...confirmadas]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    return {
      month,
      filtroPagador: filtroPagador || null,
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      topCategory: expenseByCategory[0] || null,
      expenseByCategory,
      recentTransactions,
      byPayer,
    };
  }

  /**
   * Preenche nome e cor da categoria e nome da forma de pagamento.
   *
   * Usa getAll() em vez de um get() por documento: antes eram N+M idas ao
   * Firestore por listagem, o que pesa na conta quando forem muitas famílias.
   */
  async function enriquecer(transacoes) {
    if (!transacoes.length) return [];

    const idsCategorias = [...new Set(transacoes.map((t) => t.categoryId).filter(Boolean))];
    const idsSubcategorias = [...new Set(transacoes.map((t) => t.subcategoryId).filter(Boolean))];
    const idsPagamentos = [...new Set(transacoes.map((t) => t.paymentMethodId).filter(Boolean))];

    const refs = [
      ...idsCategorias.map((id) => db.collection('categories').doc(id)),
      ...idsSubcategorias.map((id) => db.collection('subcategories').doc(id)),
      ...idsPagamentos.map((id) => db.collection('paymentMethods').doc(id)),
    ];

    const docs = refs.length ? await db.getAll(...refs) : [];

    const categorias = {};
    const subcategorias = {};
    const pagamentos = {};
    docs.forEach((doc, i) => {
      if (!doc.exists) return;
      let alvo = pagamentos;
      if (i < idsCategorias.length) alvo = categorias;
      else if (i < idsCategorias.length + idsSubcategorias.length) alvo = subcategorias;
      alvo[doc.id] = { id: doc.id, ...doc.data() };
    });

    return transacoes.map((t) => ({
      ...t,
      category: categorias[t.categoryId] || { id: t.categoryId, name: 'Desconhecida', color: '#94a3b8' },
      subcategory: t.subcategoryId ? (subcategorias[t.subcategoryId] || { id: t.subcategoryId, name: 'Desconhecida' }) : null,
      paymentMethod: pagamentos[t.paymentMethodId] || { id: t.paymentMethodId, name: 'Desconhecido' },
    }));
  }

  return { listTransactions, createTransaction, updateTransaction, deleteTransaction, getMonthlySummary };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { admin, db } = require('../config/firebaseAdmin');
    _padrao = criarServicoDeTransacoes({ db, admin });
  }
  return _padrao;
}

module.exports = {
  criarServicoDeTransacoes,
  listTransactions: (...args) => servico().listTransactions(...args),
  createTransaction: (...args) => servico().createTransaction(...args),
  updateTransaction: (...args) => servico().updateTransaction(...args),
  deleteTransaction: (...args) => servico().deleteTransaction(...args),
  getMonthlySummary: (...args) => servico().getMonthlySummary(...args),
};
