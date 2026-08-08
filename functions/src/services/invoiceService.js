const { format, addMonths } = require('date-fns');

/**
 * Fatura de cartão de crédito.
 *
 * Um cartão fecha num dia fixo do mês e vence em outro. Uma compra feita
 * depois do fechamento não entra na fatura que está prestes a vencer — entra
 * na seguinte. `cicloDaData` é a regra que decide isso; o resto do serviço
 * só soma e persiste em cima dela.
 *
 * A fatura "aberta" (ciclo corrente, ainda não fechado) é sempre calculada na
 * hora, nunca gravada — só quando o job de fechamento roda é que vira um
 * documento em `creditCardInvoices`, com total e datas congelados, para ter
 * histórico e permitir marcar como paga.
 */

function diasNoMes(ano, mesIdx) {
  return new Date(ano, mesIdx + 1, 0).getDate();
}

/** A qual ciclo (referenceCycle, 'yyyy-MM' do mês em que fecha) pertence uma data. */
function cicloDaData(data, closingDay) {
  const d = data instanceof Date ? data : new Date(data);
  const diaAlvo = Math.min(closingDay, diasNoMes(d.getFullYear(), d.getMonth()));
  const base = d.getDate() <= diaAlvo ? d : addMonths(d, 1);
  return format(base, 'yyyy-MM');
}

/** Data de fechamento e de vencimento de um ciclo específico. */
function datasDoCiclo(referenceCycle, closingDay, dueDay) {
  const [ano, mes] = referenceCycle.split('-').map(Number);
  const mesIdx = mes - 1;

  const diaFechamento = Math.min(closingDay, diasNoMes(ano, mesIdx));
  const closingDate = new Date(ano, mesIdx, diaFechamento);

  // Vencimento com dia menor que o fechamento é o padrão comum de mercado
  // (fecha dia 28, vence dia 5) — cai no mês seguinte ao fechamento.
  let dueMesIdx = mesIdx;
  let dueAno = ano;
  if (dueDay < closingDay) {
    dueMesIdx += 1;
    if (dueMesIdx > 11) { dueMesIdx = 0; dueAno += 1; }
  }
  const diaVencimento = Math.min(dueDay, diasNoMes(dueAno, dueMesIdx));
  const dueDate = new Date(dueAno, dueMesIdx, diaVencimento);

  return { closingDate, dueDate };
}

function criarServicoDeFatura({ db, admin }) {
  /** Soma ao vivo as transações do ciclo corrente — nunca grava nada. */
  async function resumoFaturaAberta(dados, paymentMethod, hoje = new Date()) {
    const cicloAtual = cicloDaData(hoje, paymentMethod.closingDay);

    const snap = await dados.consultar('transactions')
      .where('paymentMethodId', '==', paymentMethod.id)
      .where('type', '==', 'EXPENSE')
      .get();

    const doCiclo = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((t) => t.status === 'CONFIRMED')
      .filter((t) => cicloDaData(t.date?.toDate?.() || t.date, paymentMethod.closingDay) === cicloAtual);

    const totalCents = doCiclo.reduce((s, t) => s + Math.round(t.amount * 100), 0);
    const { closingDate, dueDate } = datasDoCiclo(cicloAtual, paymentMethod.closingDay, paymentMethod.dueDay);

    return {
      paymentMethodId: paymentMethod.id,
      referenceCycle: cicloAtual,
      status: 'aberta',
      totalCents,
      closingDate: closingDate.toISOString(),
      dueDate: dueDate.toISOString(),
      transacoes: doCiclo.length,
    };
  }

  async function historico(dados, paymentMethodId, limite = 24) {
    const snap = await dados.consultar('creditCardInvoices')
      .where('paymentMethodId', '==', paymentMethodId)
      .get();

    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.referenceCycle || '').localeCompare(a.referenceCycle || ''))
      .slice(0, limite);
  }

  async function marcarComoPaga(dados, invoiceId) {
    const atual = await dados.buscarDoc('creditCardInvoices', invoiceId);
    if (!atual) throw Object.assign(new Error('Fatura não encontrada.'), { statusCode: 404 });

    return dados.atualizar('creditCardInvoices', invoiceId, {
      status: 'paga',
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Job diário: varre TODOS os cartões de crédito de todas as famílias (mesma
   * exceção cross-tenant do job de contas recorrentes) e fecha quem chegou no
   * dia do fechamento e ainda não tem fatura gravada para o ciclo.
   */
  async function fecharFaturasDoDia(hoje = new Date(), escopoDe) {
    const snap = await db.collection('paymentMethods').where('isCreditCard', '==', true).get();
    const resultado = { verificados: snap.size, fechadas: 0, erros: [] };

    for (const doc of snap.docs) {
      const pm = { id: doc.id, ...doc.data() };
      if (!pm.closingDay || !pm.dueDay || !pm.householdId) continue;

      const diaAlvo = Math.min(pm.closingDay, diasNoMes(hoje.getFullYear(), hoje.getMonth()));
      if (hoje.getDate() < diaAlvo) continue;

      try {
        const dados = escopoDe(pm.householdId);
        // O ciclo que fecha HOJE é o mês corrente, não cicloDaData(hoje,...):
        // essa função responde "de qual fatura essa data é gasto", que já
        // teria virado o mês seguinte no dia depois do fechamento — e é
        // exatamente esse catch-up (cron que roda um dia atrasado) que este
        // job precisa cobrir sem fechar o ciclo errado.
        const cicloAtual = format(hoje, 'yyyy-MM');

        const jaFechada = await dados.consultar('creditCardInvoices')
          .where('paymentMethodId', '==', pm.id)
          .where('referenceCycle', '==', cicloAtual)
          .limit(1).get();
        if (!jaFechada.empty) continue;

        // Soma pelo próprio dia de fechamento do ciclo, não pela data real de
        // hoje: num catch-up de um dia atrasado, `hoje` já cicloDaData() para
        // o mês seguinte e somaria a fatura errada.
        const { closingDate: dataDeFechamentoDoCiclo } = datasDoCiclo(cicloAtual, pm.closingDay, pm.dueDay);
        const aberta = await resumoFaturaAberta(dados, pm, dataDeFechamentoDoCiclo);

        await dados.criar('creditCardInvoices', {
          paymentMethodId: pm.id,
          referenceCycle: cicloAtual,
          status: 'fechada',
          totalCents: aberta.totalCents,
          closingDate: admin.firestore.Timestamp.fromDate(new Date(aberta.closingDate)),
          dueDate: admin.firestore.Timestamp.fromDate(new Date(aberta.dueDate)),
          paidAt: null,
        });

        resultado.fechadas += 1;
      } catch (err) {
        resultado.erros.push({ paymentMethodId: pm.id, householdId: pm.householdId, erro: err.message });
      }
    }

    return resultado;
  }

  return { resumoFaturaAberta, historico, marcarComoPaga, fecharFaturasDoDia };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { db, admin } = require('../config/firebaseAdmin');
    _padrao = criarServicoDeFatura({ db, admin });
  }
  return _padrao;
}

function fecharFaturasDoDiaEmProducao(hoje = new Date()) {
  const { escopoDe } = require('../data/escopo');
  return servico().fecharFaturasDoDia(hoje, escopoDe);
}

module.exports = {
  criarServicoDeFatura,
  cicloDaData,
  datasDoCiclo,
  resumoFaturaAberta: (...args) => servico().resumoFaturaAberta(...args),
  historico: (...args) => servico().historico(...args),
  marcarComoPaga: (...args) => servico().marcarComoPaga(...args),
  fecharFaturasDoDia: fecharFaturasDoDiaEmProducao,
};
