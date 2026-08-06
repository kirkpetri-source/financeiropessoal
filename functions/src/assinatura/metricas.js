const { STATUS, situacaoDaAssinatura, paraData, PRECO_MENSAL_CENTAVOS } = require('./estado');

/**
 * Métricas do negócio, calculadas a partir da lista de famílias.
 *
 * Função pura de propósito: o painel de MRR é o número que decide se o produto
 * vive, e número de faturamento errado é pior que número nenhum. Sem Firestore
 * aqui, o cálculo é testável linha a linha.
 *
 * Definições usadas (explícitas porque cada SaaS conta de um jeito):
 *
 *   MRR    — soma do preço contratado das assinaturas com status `active`.
 *            Trial não entra: quem não pagou não é receita.
 *   Churn  — cancelamentos na janela ÷ (pagantes no fim + cancelamentos na
 *            janela). É o churn de logo, não de receita.
 *   Ativas — famílias que podem lançar hoje, incluindo trial e carência. É a
 *            métrica de uso, não a de dinheiro.
 *
 * Contas internas (`plan: 'interno'`) — a família do Kirk e futuras cortesias —
 * usam o sistema de graça e para sempre. Contam em "ativas", porque usam mesmo,
 * e ficam FORA de pagantes, MRR, churn e conversão. Somar a própria casa no MRR
 * seria mentir para si mesmo sobre o tamanho do negócio.
 */

const PLANO_INTERNO = 'interno';

const DIA_EM_MS = 24 * 60 * 60 * 1000;
const JANELA_PADRAO_DIAS = 30;

function dentroDaJanela(data, agora, dias) {
  const d = paraData(data);
  if (!d) return false;
  return agora.getTime() - d.getTime() <= dias * DIA_EM_MS && d <= agora;
}

function resumirFamilias(familias, agora = new Date(), janelaDias = JANELA_PADRAO_DIAS) {
  const contagem = {
    total: familias.length,
    ativas: 0,          // podem lançar hoje (trial + pagantes + carência)
    pagantes: 0,        // status active
    emTrial: 0,
    trialVencido: 0,
    atrasadas: 0,
    canceladas: 0,
    pendentes: 0,
    emCarencia: 0,
    aguardandoExclusao: 0,
    internas: 0,      // cortesias: usam o produto, não entram na receita
  };

  let mrrCentavos = 0;
  let novasNaJanela = 0;
  let canceladasNaJanela = 0;
  let ativadasNaJanela = 0;

  for (const familia of familias) {
    const assinatura = familia.subscription || {};
    const situacao = situacaoDaAssinatura(assinatura, agora);

    if (situacao.podeLancar) contagem.ativas += 1;
    if (situacao.emCarencia) contagem.emCarencia += 1;
    if (familia.deletion) contagem.aguardandoExclusao += 1;

    // Cortesia entra em "ativas" e para por aí: nada de receita, churn ou
    // conversão. Sai antes do switch para não cair em nenhum outro balde.
    if (assinatura.plan === PLANO_INTERNO) {
      contagem.internas += 1;
      continue;
    }

    switch (assinatura.status) {
      case STATUS.ATIVA:
        contagem.pagantes += 1;
        mrrCentavos += assinatura.priceCents ?? PRECO_MENSAL_CENTAVOS;
        break;
      case STATUS.TRIAL:
        if (situacao.podeLancar) contagem.emTrial += 1;
        else contagem.trialVencido += 1;
        break;
      case STATUS.ATRASADA: contagem.atrasadas += 1; break;
      case STATUS.CANCELADA: contagem.canceladas += 1; break;
      case STATUS.PENDENTE: contagem.pendentes += 1; break;
      default: break;
    }

    if (dentroDaJanela(familia.createdAt, agora, janelaDias)) novasNaJanela += 1;
    if (dentroDaJanela(assinatura.canceledAt, agora, janelaDias)) canceladasNaJanela += 1;
    if (dentroDaJanela(assinatura.activatedAt, agora, janelaDias)) ativadasNaJanela += 1;
  }

  // Denominador = quem estava pagando em algum momento da janela. Sem ninguém
  // pagando, churn é 0 e não NaN — dividir por zero num painel de MRR gera
  // "NaN%" na tela e pânico desnecessário.
  const baseDeChurn = contagem.pagantes + canceladasNaJanela;
  const churn = baseDeChurn > 0 ? canceladasNaJanela / baseDeChurn : 0;

  // Quantas das famílias que já saíram do trial viraram pagantes.
  const saiuDoTrial = contagem.pagantes + contagem.trialVencido + contagem.canceladas;
  const conversao = saiuDoTrial > 0 ? contagem.pagantes / saiuDoTrial : 0;

  return {
    ...contagem,
    mrrCentavos,
    mrr: mrrCentavos / 100,
    arr: (mrrCentavos * 12) / 100,
    ticketMedioCentavos: contagem.pagantes > 0 ? Math.round(mrrCentavos / contagem.pagantes) : 0,
    janelaDias,
    novasNaJanela,
    canceladasNaJanela,
    ativadasNaJanela,
    churnMensal: Number(churn.toFixed(4)),
    conversaoDeTrial: Number(conversao.toFixed(4)),
  };
}

module.exports = { resumirFamilias, JANELA_PADRAO_DIAS, PLANO_INTERNO };
