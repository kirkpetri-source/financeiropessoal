const { format } = require('date-fns');

/**
 * Contas fixas recorrentes (aluguel, assinatura, mensalidade...).
 *
 * O lançamento do mês é gerado sozinho por um job diário
 * (`gerarLancamentosDoDia`), não na hora do cadastro — diferente do
 * parcelamento, que já sabe o número total de parcelas de antemão, a conta
 * fixa não tem fim definido. O "lembrete" pedido pelo Kirk é só visual
 * (painel), sem mensagem paga de WhatsApp: `proximasVencer` é o que alimenta
 * essa lista.
 *
 * `db` e `criarTransacao` entram por parâmetro (fábrica) pelo mesmo motivo de
 * `budgetService.js`: enriquecer com categoria/forma de pagamento e criar o
 * lançamento do mês exigem sair do escopo de uma família só, e um require
 * direto de `config/firebaseAdmin` arrastaria o Firestore de produção para
 * dentro do teste.
 */

/** Último dia válido do mês — trava dueDay=31 em fevereiro, por exemplo. */
function diaAlvo(dueDay, ano, mes) {
  const diaMax = new Date(ano, mes + 1, 0).getDate();
  return Math.min(dueDay, diaMax);
}

/**
 * A conta precisa virar lançamento hoje?
 *
 * Não exige bater no dia exato: o job roda diariamente, então "hoje >= dia de
 * vencimento e ainda não gerou este mês" cobre também o caso de o cron ter
 * falhado ontem, sem gerar duas vezes nem pular o mês.
 */
function precisaGerar(bill, hoje) {
  if (!bill.active) return false;
  const refMes = format(hoje, 'yyyy-MM');
  if (bill.lastGeneratedMonth === refMes) return false;
  return hoje.getDate() >= diaAlvo(bill.dueDay, hoje.getFullYear(), hoje.getMonth());
}

/** Próxima data em que a conta vai vencer, considerando o que já foi gerado. */
function proximaOcorrencia(bill, hoje) {
  const refMesAtual = format(hoje, 'yyyy-MM');
  const jaGerouEsseMes = bill.lastGeneratedMonth === refMesAtual;

  let ano = hoje.getFullYear();
  let mes = hoje.getMonth();
  let data = new Date(ano, mes, diaAlvo(bill.dueDay, ano, mes));

  if (jaGerouEsseMes || data < hoje) {
    mes += 1;
    if (mes > 11) { mes = 0; ano += 1; }
    data = new Date(ano, mes, diaAlvo(bill.dueDay, ano, mes));
  }

  return data;
}

/** Contas ativas que vencem dentro da janela — é a lista de "próximas" do painel. */
function proximasVencer(bills, hoje, diasJanela = 7) {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;

  return bills
    .filter((b) => b.active)
    .map((b) => ({ ...b, proximaData: proximaOcorrencia(b, hoje) }))
    .filter((b) => Math.ceil((b.proximaData.getTime() - hoje.getTime()) / MS_POR_DIA) <= diasJanela)
    .sort((a, b) => a.proximaData - b.proximaData);
}

function criarServicoDeContasRecorrentes({ db, criarTransacao }) {
  async function enriquecer(bills) {
    if (!bills.length) return [];

    const idsCategorias = [...new Set(bills.map((b) => b.categoryId).filter(Boolean))];
    const idsPagamentos = [...new Set(bills.map((b) => b.paymentMethodId).filter(Boolean))];

    const refs = [
      ...idsCategorias.map((id) => db.collection('categories').doc(id)),
      ...idsPagamentos.map((id) => db.collection('paymentMethods').doc(id)),
    ];
    const docs = refs.length ? await db.getAll(...refs) : [];

    const categorias = {};
    const pagamentos = {};
    docs.forEach((doc, i) => {
      if (!doc.exists) return;
      const alvo = i < idsCategorias.length ? categorias : pagamentos;
      alvo[doc.id] = { id: doc.id, ...doc.data() };
    });

    return bills.map((b) => ({
      ...b,
      category: categorias[b.categoryId] || { id: b.categoryId, name: 'Desconhecida' },
      paymentMethod: pagamentos[b.paymentMethodId] || { id: b.paymentMethodId, name: 'Desconhecida' },
    }));
  }

  async function listRecurringBills(dados) {
    const snap = await dados.consultar('recurringBills').get();
    return enriquecer(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function createRecurringBill(dados, entrada) {
    const criada = await dados.criar('recurringBills', {
      description: entrada.description,
      amountCents: entrada.amountCents,
      type: entrada.type,
      dueDay: entrada.dueDay,
      categoryId: entrada.categoryId,
      paymentMethodId: entrada.paymentMethodId,
      active: entrada.active ?? true,
      lastGeneratedMonth: null,
    });
    const [enriquecida] = await enriquecer([criada]);
    return enriquecida;
  }

  async function updateRecurringBill(dados, billId, entrada) {
    const alteracao = {};
    const campos = ['description', 'amountCents', 'type', 'dueDay', 'categoryId', 'paymentMethodId', 'active'];
    for (const campo of campos) {
      if (entrada[campo] !== undefined) alteracao[campo] = entrada[campo];
    }

    const atualizada = await dados.atualizar('recurringBills', billId, alteracao);
    const [enriquecida] = await enriquecer([atualizada]);
    return enriquecida;
  }

  async function deleteRecurringBill(dados, billId) {
    await dados.remover('recurringBills', billId);
  }

  async function listarProximas(dados, hoje = new Date(), diasJanela = 7) {
    const snap = await dados.consultar('recurringBills').where('active', '==', true).get();
    const bills = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const proximas = proximasVencer(bills, hoje, diasJanela);
    const enriquecidas = await enriquecer(proximas);
    return enriquecidas.map((b, i) => ({ ...b, proximaData: proximas[i].proximaData.toISOString() }));
  }

  /**
   * Job diário: varre TODAS as famílias (mesma exceção documentada do job de
   * exclusão da LGPD) e gera o lançamento de quem vence hoje.
   */
  async function gerarLancamentosDoDia(hoje = new Date(), escopoDe) {
    const snap = await db.collection('recurringBills').where('active', '==', true).get();
    const resultado = { verificadas: snap.size, geradas: 0, erros: [] };

    for (const doc of snap.docs) {
      const bill = { id: doc.id, ...doc.data() };
      if (!precisaGerar(bill, hoje)) continue;

      try {
        const dados = escopoDe(bill.householdId);
        const dataDoLancamento = new Date(
          hoje.getFullYear(), hoje.getMonth(), diaAlvo(bill.dueDay, hoje.getFullYear(), hoje.getMonth())
        );

        await criarTransacao(dados, {
          type: bill.type,
          description: bill.description,
          amount: bill.amountCents / 100,
          categoryId: bill.categoryId,
          paymentMethodId: bill.paymentMethodId,
          date: dataDoLancamento.toISOString(),
          notes: 'Conta fixa recorrente, lançada automaticamente.',
          origin: 'RECURRING',
          status: 'CONFIRMED',
        });

        await dados.atualizar('recurringBills', bill.id, { lastGeneratedMonth: format(hoje, 'yyyy-MM') });
        resultado.geradas += 1;
      } catch (err) {
        resultado.erros.push({ billId: bill.id, householdId: bill.householdId, erro: err.message });
      }
    }

    return resultado;
  }

  return {
    listRecurringBills,
    createRecurringBill,
    updateRecurringBill,
    deleteRecurringBill,
    listarProximas,
    gerarLancamentosDoDia,
  };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { db } = require('../config/firebaseAdmin');
    const { createTransaction } = require('./transactionService');
    _padrao = criarServicoDeContasRecorrentes({ db, criarTransacao: createTransaction });
  }
  return _padrao;
}

/** Job de produção: usa o escopoDe real, ligado ao Firestore de verdade. */
function gerarLancamentosDoDiaEmProducao(hoje = new Date()) {
  const { escopoDe } = require('../data/escopo');
  return servico().gerarLancamentosDoDia(hoje, escopoDe);
}

module.exports = {
  criarServicoDeContasRecorrentes,
  precisaGerar,
  proximaOcorrencia,
  proximasVencer,
  listRecurringBills: (...args) => servico().listRecurringBills(...args),
  createRecurringBill: (...args) => servico().createRecurringBill(...args),
  updateRecurringBill: (...args) => servico().updateRecurringBill(...args),
  deleteRecurringBill: (...args) => servico().deleteRecurringBill(...args),
  listarProximas: (...args) => servico().listarProximas(...args),
  gerarLancamentosDoDia: gerarLancamentosDoDiaEmProducao,
};
