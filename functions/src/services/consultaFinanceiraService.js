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

// Teto do recorte em dias. Mais que isso é pergunta de mês, e a agregação
// mensal já responde sem varrer dois meses de documentos.
const MAX_DIAS_RECORTE = 62;

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

const NOMES_DOS_MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Como a pessoa chamaria essa janela: "hoje" soa melhor que "últimos 1 dia". */
function nomeDaJanela(dias) {
  if (dias === 1) return 'hoje';
  if (dias === 7) return 'os últimos 7 dias';
  return `os últimos ${dias} dias`;
}

function mesPorExtensoCurto(mes) {
  const [ano, m] = String(mes || '').split('-');
  const nome = NOMES_DOS_MESES[Number(m) - 1];
  return nome ? `${nome} de ${ano}` : mes;
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

    // AGRUPA POR NOME, e não por id. `listCategories` junta as categorias
    // padrão do sistema com as da família, então uma família que criou a
    // própria "Lazer" (nome que já existe no padrão) aparecia DUAS vezes: uma
    // vazia e outra com as subcategorias. A IA que lesse a entrada errada
    // concluiria que Lazer não tem subcategoria — e "quanto gastei em futebol"
    // deixaria de funcionar.
    //
    // Do ponto de vista de quem usa, duas categorias com o mesmo nome são a
    // mesma coisa; é assim que `gastoPorCategoria` já agrupa. Só apareceu
    // testando contra dados reais: o dublê dos testes não tinha categoria padrão.
    const porNome = new Map();

    for (const c of categorias) {
      const chave = normalizar(c.name);
      if (!porNome.has(chave)) {
        porNome.set(chave, { categoria: c.name, tipo: c.type || 'BOTH', subcategorias: [] });
      }

      const entrada = porNome.get(chave);
      for (const nome of porCategoria.get(c.id) || []) {
        if (!entrada.subcategorias.includes(nome)) entrada.subcategorias.push(nome);
      }
    }

    return [...porNome.values()];
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

  /**
   * Quanto CADA PESSOA da família gastou num recorte de tempo.
   *
   * Existe porque relatório por pessoa em recorte menor que o mês só era
   * possível pedindo a lista crua para a IA e deixando ela somar. Isso quebrava
   * de duas formas: `listarLancamentos` corta em 40 itens, então numa família
   * ativa a soma da semana sairia MENOR que a real, sem avisar; e somar é
   * justamente o que a IA não deve fazer (ver o cabeçalho deste arquivo).
   *
   * Aqui a conta é do banco e o recorte é explícito. `dias` conta a partir de
   * HOJE no fuso do Brasil — o Cloud Run roda em UTC, e sem isso "hoje"
   * começaria três horas cedo e pegaria gasto do dia anterior.
   *
   * @param {{mes?: string, dias?: number, categoria?: string}} p
   *   `dias` vence `mes`: quem pede "essa semana" não quer o mês inteiro.
   */
  async function gastoPorPessoa(dados, { mes, dias, categoria } = {}) {
    const janela = Number(dias) > 0 ? Math.min(Number(dias), MAX_DIAS_RECORTE) : null;

    // Um recorte em dias pode cruzar a virada do mês ("últimos 15 dias" no dia
    // 10). Buscar os dois meses e filtrar por data cobre isso.
    const mesBase = mes || mesAtual();
    const meses = janela ? [deslocarMes(mesBase, -1), mesBase] : [mesBase];

    const listas = await Promise.all(meses.map((m) => lancamentosDoMes(dados, m)));
    let lista = despesas(listas.flat());

    let desde = null;
    if (janela) {
      // `dias: 1` é hoje; `dias: 7` é hoje e os seis anteriores.
      const hoje = hojeNoBrasil(new Date());
      const [ano, m, d] = hoje.split('-').map(Number);
      desde = new Date(Date.UTC(ano, m - 1, d - (janela - 1)));

      lista = lista.filter((t) => {
        const data = t.date instanceof Date ? t.date : new Date(t.date);
        if (Number.isNaN(data.getTime())) return false;
        return data >= desde;
      });
    }

    if (categoria) {
      const alvo = normalizar(categoria);
      lista = lista.filter((t) => normalizar(t.category?.name || '') === alvo);
    }

    const porPessoa = new Map();
    for (const t of lista) {
      const quem = t.paidBy || 'sem identificação';
      if (!porPessoa.has(quem)) {
        porPessoa.set(quem, { pessoa: quem, total: 0, quantidade: 0, categorias: {} });
      }
      const item = porPessoa.get(quem);
      item.total += Number(t.amount) || 0;
      item.quantidade += 1;

      const nomeCat = t.category?.name || 'Outros';
      item.categorias[nomeCat] = (item.categorias[nomeCat] || 0) + (Number(t.amount) || 0);
    }

    const total = [...porPessoa.values()].reduce((s, p) => s + p.total, 0);

    return {
      periodo: janela ? nomeDaJanela(janela) : mesPorExtensoCurto(mesBase),
      desde: desde ? desde.toISOString().slice(0, 10) : null,
      mes: janela ? null : mesBase,
      categoria: categoria || null,
      total,
      pessoas: [...porPessoa.values()]
        .map((p) => ({
          ...p,
          fatia: total > 0 ? Math.round((p.total / total) * 100) : 0,
          categorias: Object.entries(p.categorias)
            .map(([nome, valor]) => ({ categoria: nome, total: valor }))
            .sort((a, b) => b.total - a.total),
        }))
        .sort((a, b) => b.total - a.total),
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
    gastoPorPessoa,
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
