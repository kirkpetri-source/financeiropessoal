const { normalizar } = require('../utils/normalizarTexto');
const { hojeNoBrasil } = require('../utils/fusoBrasil');

/**
 * As consultas que o consultor de IA pode pedir sobre os dados da família.
 *
 * REGRA QUE SUSTENTA O ISOLAMENTO INTEIRO: nenhuma função aqui recebe
 * `householdId`. Todas recebem `dados` — o acessor já preso a uma família,
 * devolvido por `escopoDe()`. A IA nunca vê, escolhe ou consegue pedir outro
 * inquilino, porque isso não é um argumento que exista.
 *
 * Se `householdId` fosse parâmetro preenchido pela IA, uma frase bem construída
 * atravessaria o isolamento entre famílias, e nenhum prompt seguraria isso de
 * forma confiável. Há um teste que percorre o catálogo garantindo que nenhuma
 * ferramenta declara esse parâmetro.
 *
 * A IA também nunca CALCULA: todo número que ela cita numa resposta saiu de uma
 * destas funções, que leram o Firestore. Ela interpreta e aconselha em cima de
 * números que já vieram prontos.
 */

// Teto de meses do retrato financeiro. Sem isso, "analise meus últimos 5 anos"
// viraria varredura de milhares de documentos numa assinatura de preço fixo.
const MAX_MESES_RETRATO = 6;
const MAX_LANCAMENTOS = 40;

function mesAtual(agora = new Date()) {
  return hojeNoBrasil(agora).slice(0, 7);
}

/** Desloca um AAAA-MM em N meses (negativo volta no tempo). */
function deslocarMes(mes, delta) {
  const [ano, m] = String(mes).split('-').map(Number);
  const d = new Date(Date.UTC(ano, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function somar(lista, filtro = () => true) {
  return lista.filter(filtro).reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

function confirmadas(lista) {
  return lista.filter((t) => t.status === 'CONFIRMED');
}

function despesas(lista) {
  return confirmadas(lista).filter((t) => t.type === 'EXPENSE');
}

function criarConsultaFinanceira({ transactionService, categoryService, subcategoryService, budgetService, recurringBillService }) {
  /**
   * Vocabulário da família: a árvore de categorias com suas subcategorias.
   *
   * Vai no começo da conversa, antes de qualquer ferramenta. É o que permite à
   * pessoa perguntar "quanto gastei em futebol?" sem dizer que futebol fica
   * dentro de Lazer — sem isso, a IA teria que adivinhar ou chamar ferramenta
   * às cegas. Custa 200 a 400 tokens e resolve o caso mais natural de todos:
   * o cliente pensa na subcategoria, não na árvore.
   */
  async function montarVocabulario(dados) {
    const [categorias, subcategorias] = await Promise.all([
      categoryService.listCategories(dados),
      subcategoryService.listSubcategories(dados),
    ]);

    const porCategoria = new Map();
    for (const s of subcategorias) {
      if (!porCategoria.has(s.categoryId)) porCategoria.set(s.categoryId, []);
      porCategoria.get(s.categoryId).push(s.name);
    }

    return categorias.map((c) => ({
      categoria: c.name,
      tipo: c.type || 'BOTH',
      subcategorias: porCategoria.get(c.id) || [],
    }));
  }

  async function lancamentosDoMes(dados, mes) {
    return transactionService.listTransactions(dados, { month: mes });
  }

  async function resumoDoMes(dados, { mes } = {}) {
    const alvo = mes || mesAtual();
    const lista = await lancamentosDoMes(dados, alvo);
    const ok = confirmadas(lista);

    const receitas = somar(ok, (t) => t.type === 'INCOME');
    const gastos = somar(ok, (t) => t.type === 'EXPENSE');

    const porPessoa = {};
    for (const t of ok) {
      const quem = t.paidBy || 'sem identificação';
      if (!porPessoa[quem]) porPessoa[quem] = { pessoa: quem, receitas: 0, gastos: 0 };
      if (t.type === 'INCOME') porPessoa[quem].receitas += t.amount;
      else porPessoa[quem].gastos += t.amount;
    }

    return {
      mes: alvo,
      receitas,
      gastos,
      saldo: receitas - gastos,
      quantidadeDeLancamentos: ok.length,
      porPessoa: Object.values(porPessoa).sort((a, b) => b.gastos - a.gastos),
    };
  }

  /**
   * Gasto por categoria, com a quebra por subcategoria junto quando a família
   * usa subcategoria naquela categoria.
   */
  async function gastoPorCategoria(dados, { mes, categoria } = {}) {
    const alvo = mes || mesAtual();
    const lista = despesas(await lancamentosDoMes(dados, alvo));
    const total = somar(lista);

    const agrupado = new Map();
    for (const t of lista) {
      const nome = t.category?.name || 'Outros';
      if (!agrupado.has(nome)) agrupado.set(nome, { categoria: nome, total: 0, subcategorias: {} });
      const item = agrupado.get(nome);
      item.total += t.amount;

      if (t.subcategory?.name) {
        item.subcategorias[t.subcategory.name] = (item.subcategorias[t.subcategory.name] || 0) + t.amount;
      }
    }

    let itens = [...agrupado.values()];

    if (categoria) {
      const alvoNome = normalizar(categoria);
      itens = itens.filter((i) => normalizar(i.categoria) === alvoNome);
    }

    return {
      mes: alvo,
      totalDeGastosNoMes: total,
      categorias: itens
        .map((i) => ({
          categoria: i.categoria,
          total: i.total,
          fatiaDoMes: total > 0 ? Math.round((i.total / total) * 100) : 0,
          subcategorias: Object.entries(i.subcategorias)
            .map(([nome, valor]) => ({ subcategoria: nome, total: valor }))
            .sort((a, b) => b.total - a.total),
        }))
        .sort((a, b) => b.total - a.total),
    };
  }

  /**
   * Gasto de UMA subcategoria, sem exigir a categoria-mãe.
   *
   * Requisito explícito: "quanto gastei em futebol esse mês?" precisa funcionar
   * sem a pessoa dizer que futebol fica em Lazer. Ela pensa na subcategoria.
   *
   * Nome repetido em categorias diferentes (Lazer > Futebol e Educação >
   * Futebol, a escolinha do filho) devolve as DUAS, discriminadas. Somar em
   * silêncio esconderia que são coisas diferentes; escolher uma seria chute.
   */
  async function gastoPorSubcategoria(dados, { mes, subcategoria } = {}) {
    const alvo = mes || mesAtual();
    if (!subcategoria) return { mes: alvo, subcategoria: null, encontrados: [] };

    const procurado = normalizar(subcategoria);
    const lista = despesas(await lancamentosDoMes(dados, alvo));

    // Chave por categoria-mãe: é o que separa dois "Futebol" homônimos.
    const porMae = new Map();
    for (const t of lista) {
      if (!t.subcategory?.name || normalizar(t.subcategory.name) !== procurado) continue;

      const mae = t.category?.name || 'Outros';
      if (!porMae.has(mae)) {
        porMae.set(mae, { categoria: mae, subcategoria: t.subcategory.name, total: 0, quantidade: 0 });
      }
      const item = porMae.get(mae);
      item.total += t.amount;
      item.quantidade += 1;
    }

    const encontrados = [...porMae.values()].sort((a, b) => b.total - a.total);

    return {
      mes: alvo,
      subcategoria,
      encontrados,
      // Sinaliza o caso ambíguo para a resposta citar as duas, em vez de somar.
      homonimaEmVariasCategorias: encontrados.length > 1,
      total: encontrados.reduce((s, i) => s + i.total, 0),
    };
  }

  async function compararPeriodos(dados, { mesA, mesB } = {}) {
    const primeiro = mesA || deslocarMes(mesAtual(), -1);
    const segundo = mesB || mesAtual();

    const [a, b] = await Promise.all([
      gastoPorCategoria(dados, { mes: primeiro }),
      gastoPorCategoria(dados, { mes: segundo }),
    ]);

    const nomes = new Set([
      ...a.categorias.map((c) => c.categoria),
      ...b.categorias.map((c) => c.categoria),
    ]);

    const porCategoria = [...nomes].map((nome) => {
      const va = a.categorias.find((c) => c.categoria === nome)?.total || 0;
      const vb = b.categorias.find((c) => c.categoria === nome)?.total || 0;
      return {
        categoria: nome,
        [primeiro]: va,
        [segundo]: vb,
        variacao: vb - va,
        variacaoPercentual: va > 0 ? Math.round(((vb - va) / va) * 100) : null,
      };
    }).sort((x, y) => Math.abs(y.variacao) - Math.abs(x.variacao));

    return {
      de: primeiro,
      para: segundo,
      totalDe: a.totalDeGastosNoMes,
      totalPara: b.totalDeGastosNoMes,
      variacaoTotal: b.totalDeGastosNoMes - a.totalDeGastosNoMes,
      porCategoria,
    };
  }

  async function listarLancamentos(dados, { mes, categoria, subcategoria, limite } = {}) {
    const alvo = mes || mesAtual();
    let lista = confirmadas(await lancamentosDoMes(dados, alvo));

    if (categoria) {
      const n = normalizar(categoria);
      lista = lista.filter((t) => normalizar(t.category?.name || '') === n);
    }
    if (subcategoria) {
      const n = normalizar(subcategoria);
      lista = lista.filter((t) => normalizar(t.subcategory?.name || '') === n);
    }

    const teto = Math.min(Number(limite) || 10, MAX_LANCAMENTOS);

    return {
      mes: alvo,
      quantidadeTotal: lista.length,
      mostrando: Math.min(teto, lista.length),
      lancamentos: lista.slice(0, teto).map((t) => ({
        data: t.date instanceof Date ? t.date.toISOString().slice(0, 10) : String(t.date).slice(0, 10),
        descricao: t.description,
        valor: t.amount,
        tipo: t.type,
        categoria: t.category?.name || null,
        subcategoria: t.subcategory?.name || null,
        formaDePagamento: t.paymentMethod?.name || null,
        pagoPor: t.paidBy || null,
      })),
    };
  }

  async function listarCategorias(dados, { tipo } = {}) {
    const categorias = await categoryService.listCategories(dados);
    const filtradas = tipo
      ? categorias.filter((c) => c.type === tipo || c.type === 'BOTH')
      : categorias;

    return { categorias: filtradas.map((c) => ({ nome: c.name, tipo: c.type || 'BOTH' })) };
  }

  async function listarSubcategorias(dados, { categoria } = {}) {
    const [todas, categorias] = await Promise.all([
      subcategoryService.listSubcategories(dados),
      categoryService.listCategories(dados),
    ]);

    const nomeDaCategoria = new Map(categorias.map((c) => [c.id, c.name]));

    let itens = todas.map((s) => ({
      subcategoria: s.name,
      categoria: nomeDaCategoria.get(s.categoryId) || null,
    }));

    if (categoria) {
      const n = normalizar(categoria);
      itens = itens.filter((i) => normalizar(i.categoria || '') === n);
    }

    return { subcategorias: itens };
  }

  async function contasFixasEOrcamento(dados) {
    const [orcamentos, recorrentes] = await Promise.all([
      budgetService.listBudgets(dados),
      recurringBillService.listRecurringBills(dados),
    ]);

    return {
      orcamentos: (orcamentos || []).map((o) => ({
        categoria: o.category?.name || null,
        limiteMensal: (o.monthlyLimitCents || 0) / 100,
        gastoNoMes: o.spent != null ? o.spent : null,
      })),
      contasFixas: (recorrentes || []).map((r) => ({
        descricao: r.description,
        valor: r.amount,
        diaDoVencimento: r.dueDay,
        categoria: r.category?.name || null,
      })),
    };
  }

  /**
   * Base das perguntas de conselho ("como diminuir minhas despesas?"): a
   * fotografia dos últimos meses, com média e tendência por categoria.
   */
  async function retratoFinanceiro(dados, { meses } = {}) {
    const quantos = Math.min(Math.max(Number(meses) || 3, 2), MAX_MESES_RETRATO);
    const atual = mesAtual();
    const alvos = Array.from({ length: quantos }, (_, i) => deslocarMes(atual, -(quantos - 1 - i)));

    const resumos = await Promise.all(alvos.map((m) => gastoPorCategoria(dados, { mes: m })));

    const porCategoria = new Map();
    for (const r of resumos) {
      for (const c of r.categorias) {
        if (!porCategoria.has(c.categoria)) porCategoria.set(c.categoria, []);
        porCategoria.get(c.categoria).push({ mes: r.mes, total: c.total });
      }
    }

    const categorias = [...porCategoria.entries()].map(([nome, series]) => {
      const soma = series.reduce((s, x) => s + x.total, 0);
      return {
        categoria: nome,
        media: Math.round((soma / quantos) * 100) / 100,
        totalNoPeriodo: soma,
        porMes: series,
      };
    }).sort((a, b) => b.totalNoPeriodo - a.totalNoPeriodo);

    return {
      meses: alvos,
      totalPorMes: resumos.map((r) => ({ mes: r.mes, total: r.totalDeGastosNoMes })),
      mediaMensal: Math.round(
        (resumos.reduce((s, r) => s + r.totalDeGastosNoMes, 0) / quantos) * 100
      ) / 100,
      categorias,
    };
  }

  return {
    montarVocabulario,
    resumoDoMes,
    gastoPorCategoria,
    gastoPorSubcategoria,
    compararPeriodos,
    listarLancamentos,
    listarCategorias,
    listarSubcategorias,
    contasFixasEOrcamento,
    retratoFinanceiro,
  };
}

module.exports = {
  criarConsultaFinanceira,
  MAX_MESES_RETRATO,
  MAX_LANCAMENTOS,
  deslocarMes,
  mesAtual,
};
