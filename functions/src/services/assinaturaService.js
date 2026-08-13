const {
  STATUS,
  PRECO_MENSAL_CENTAVOS,
  situacaoDaAssinatura,
  mensagemDaSituacao,
  paraData,
} = require('../assinatura/estado');
const { PLANO_INTERNO } = require('../assinatura/metricas');

/**
 * Assinatura da família — a ponte entre o Firestore e o Mercado Pago.
 *
 * Regras que valem aqui:
 *
 * 1. **O provedor manda no status.** O painel nunca escreve `active` por conta
 *    própria; quem promove para ativa é o webhook, depois de consultar a API.
 *    Assim um cliente não vira assinante clicando em "já paguei".
 *
 * 2. **Todo evento de cobrança fica registrado** em
 *    `households/{id}/billingEvents/{eventoId}`, com o id do provedor como id do
 *    documento. É o que torna o webhook idempotente: o Mercado Pago reentrega a
 *    mesma notificação várias vezes e a segunda não pode contar de novo.
 *
 * 3. **O household é achado por `external_reference`**, que carrega o
 *    householdId desde a criação do preapproval. Nada de casar por e-mail.
 */

const COLECAO = 'households';
const EVENTOS = 'billingEvents';

function criarServicoDeAssinatura({ db, admin, cliente }) {
  function refHousehold(householdId) {
    return db.collection(COLECAO).doc(householdId);
  }

  function agora() {
    return admin.firestore.FieldValue.serverTimestamp();
  }

  function paraTimestamp(valor) {
    const d = paraData(valor);
    return d ? admin.firestore.Timestamp.fromDate(d) : null;
  }

  async function buscarHousehold(householdId) {
    const doc = await refHousehold(householdId).get();
    if (!doc.exists) throw Object.assign(new Error('Família não encontrada.'), { statusCode: 404 });
    return { id: doc.id, ...doc.data() };
  }

  /** Situação da assinatura no formato que a API e o WhatsApp consomem. */
  async function situacaoDaFamilia(householdId) {
    const household = await buscarHousehold(householdId);
    return montarSituacao(household);
  }

  function montarSituacao(household) {
    const s = household.subscription || null;
    const situacao = situacaoDaAssinatura(s, new Date());
    return {
      ...situacao,
      expiraEm: situacao.expiraEm ? situacao.expiraEm.toISOString() : null,
      plano: s?.plan || 'familia',
      provedor: s?.provider || null,
      precoCentavos: s?.priceCents ?? PRECO_MENSAL_CENTAVOS,
      temAssinaturaNoProvedor: !!s?.externalId,
      mensagem: mensagemDaSituacao(situacao),
    };
  }

  /**
   * Cria (ou recria) a assinatura no Mercado Pago e devolve o link de pagamento.
   *
   * Não cancela a assinatura anterior automaticamente: se o cliente já tem uma
   * autorizada, cobrar de novo seria cobrança dupla. Nesse caso devolvemos erro
   * e o cliente cancela antes, de propósito.
   */
  async function iniciarCheckout(householdId, { email, urlDeRetorno }) {
    const household = await buscarHousehold(householdId);
    const assinaturaAtual = household.subscription;
    const situacao = situacaoDaAssinatura(assinaturaAtual, new Date());

    if (assinaturaAtual?.status === STATUS.ATIVA && !situacao.emCarencia) {
      throw Object.assign(
        new Error('Esta família já tem assinatura ativa.'),
        { statusCode: 409, codigo: 'JA_ASSINANTE' }
      );
    }

    // Reaproveita o plano que a família já tem em vez de criar outro a cada
    // clique em "Assinar". Duas razões: o link do plano não expira (é o mesmo
    // para sempre, o cliente pode voltar depois), e o suporte do Mercado Pago
    // (13/08/2026) apontou "várias tentativas seguidas com o mesmo contexto"
    // como um dos gatilhos de cc_rejected_high_risk. Confirma no PROVEDOR, não
    // só no Firestore, porque o plano pode ter sido cancelado do lado de lá.
    if (assinaturaAtual?.planId && assinaturaAtual?.checkoutUrl) {
      const planoVivo = await cliente().buscarPlano(assinaturaAtual.planId)
        .then((p) => p.status === 'active')
        .catch(() => false);

      if (planoVivo) {
        return { linkDePagamento: assinaturaAtual.checkoutUrl, planId: assinaturaAtual.planId };
      }
    }

    // Plano, e não preapproval com payer_email: é o que deixa o cliente pagar
    // com cartão SEM ter conta no Mercado Pago. Ver o comentário longo em
    // `mercadoPago.criarPlano`.
    const resultado = await cliente().criarPlano({
      householdId,
      urlDeRetorno,
      precoCentavos: PRECO_MENSAL_CENTAVOS,
    });

    const atualizacao = {
      'subscription.provider': 'mercadopago',
      'subscription.planId': resultado.id,
      'subscription.priceCents': PRECO_MENSAL_CENTAVOS,
      'subscription.checkoutUrl': resultado.linkDePagamento,
      'subscription.payerEmail': email || null,
      'subscription.updatedAt': agora(),
      updatedAt: agora(),
    };

    // Quem está em trial continua em trial. Sobrescrever "trialing" por
    // "pending" tiraria os dias de teste que ainda faltam de quem só foi
    // adiantado e assinou no terceiro dia.
    if (household.subscription?.status !== STATUS.TRIAL) {
      atualizacao['subscription.status'] = STATUS.PENDENTE;
    }

    await refHousehold(householdId).update(atualizacao);

    await registrarEvento(householdId, `checkout-${resultado.id}`, {
      tipo: 'checkout_criado',
      planId: resultado.id,
      valorCentavos: PRECO_MENSAL_CENTAVOS,
    });

    return { linkDePagamento: resultado.linkDePagamento, planId: resultado.id };
  }

  /**
   * Acha a família dona de um plano de assinatura.
   *
   * `where` sozinho, sem orderBy: é uma busca por igualdade num campo único
   * (cada plano pertence a uma família só), então não precisa de índice
   * composto — a mesma decisão documentada em adminAuditService.
   */
  async function acharFamiliaPorPlano(planId) {
    if (!planId) return null;

    const snap = await db.collection(COLECAO)
      .where('subscription.planId', '==', planId)
      .limit(1)
      .get();

    return snap.empty ? null : snap.docs[0].id;
  }

  /**
   * Lê a assinatura no provedor e grava o estado resultante. É o único caminho
   * que promove uma família para `active`.
   */
  async function sincronizarDoProvedor(preapprovalId) {
    const remota = await cliente().buscarAssinatura(preapprovalId);

    // Duas formas de achar a família, nesta ordem:
    //   1. external_reference do preapproval — vale para quem assinou pelo
    //      fluxo antigo (preapproval criado por nós, com payer_email);
    //   2. o plano que originou a assinatura — é o caminho de quem assina
    //      pelo link do plano, onde o preapproval nasce do lado do Mercado
    //      Pago e pode chegar sem external_reference próprio. Cada família
    //      tem um plano exclusivo, então a busca é determinística.
    const householdId = remota.householdId || await acharFamiliaPorPlano(remota.planId);

    if (!householdId) {
      console.warn(`[Assinatura] preapproval ${preapprovalId} sem external_reference nem plano conhecido — ignorado.`);
      return { ignorado: true, motivo: 'SEM_EXTERNAL_REFERENCE' };
    }

    const doc = await refHousehold(householdId).get();
    if (!doc.exists) {
      console.warn(`[Assinatura] preapproval ${preapprovalId} aponta para família inexistente ${householdId}.`);
      return { ignorado: true, motivo: 'FAMILIA_INEXISTENTE' };
    }

    // Status que o provedor não conhece não vira nada — falha fechada, sem
    // promover ninguém por engano.
    if (!remota.status) {
      console.warn(`[Assinatura] status desconhecido "${remota.statusDoProvedor}" em ${preapprovalId}.`);
      return { ignorado: true, motivo: 'STATUS_DESCONHECIDO' };
    }

    const atualizacao = {
      'subscription.status': remota.status,
      'subscription.provider': 'mercadopago',
      'subscription.externalId': remota.id,
      'subscription.providerStatus': remota.statusDoProvedor,
      'subscription.updatedAt': agora(),
      updatedAt: agora(),
    };

    if (remota.valorCentavos != null) atualizacao['subscription.priceCents'] = remota.valorCentavos;

    const proximo = paraTimestamp(remota.proximoPagamento);
    if (proximo) atualizacao['subscription.currentPeriodEnd'] = proximo;

    if (remota.status === STATUS.ATIVA) {
      // activatedAt marca a PRIMEIRA ativação — é o que o painel usa para
      // medir tempo de casa. Reescrever a cada webhook zeraria a métrica.
      if (!doc.data().subscription?.activatedAt) {
        atualizacao['subscription.activatedAt'] = agora();
      }
      atualizacao['subscription.canceledAt'] = null;
    }
    if (remota.status === STATUS.CANCELADA) {
      atualizacao['subscription.canceledAt'] = agora();
    }

    await refHousehold(householdId).update(atualizacao);

    return { householdId, status: remota.status, ignorado: false };
  }

  /**
   * Pagamento de um ciclo. `processed` confirma o mês; `recycling` significa que
   * a cobrança falhou e o Mercado Pago vai tentar de novo — nesse caso a
   * assinatura entra em atraso e a carência começa a correr.
   */
  async function registrarPagamento(authorizedPaymentId) {
    const pagamento = await cliente().buscarPagamentoAutorizado(authorizedPaymentId);

    if (!pagamento.assinaturaId) {
      return { ignorado: true, motivo: 'SEM_ASSINATURA' };
    }

    const sincronizado = await sincronizarDoProvedor(pagamento.assinaturaId);
    if (sincronizado.ignorado) return sincronizado;

    const { householdId } = sincronizado;

    const novo = await registrarEvento(householdId, `pagamento-${pagamento.id}`, {
      tipo: 'pagamento',
      externalId: String(pagamento.id),
      assinaturaId: pagamento.assinaturaId,
      status: pagamento.status,
      pagamentoStatus: pagamento.pagamentoStatus,
      valorCentavos: pagamento.valorCentavos,
    });

    if (!novo) return { householdId, duplicado: true };

    if (pagamento.status === 'processed') {
      await refHousehold(householdId).update({
        'subscription.lastPaymentAt': agora(),
        'subscription.status': STATUS.ATIVA,
        'subscription.updatedAt': agora(),
      });
    } else if (pagamento.status === 'recycling') {
      await refHousehold(householdId).update({
        'subscription.status': STATUS.ATRASADA,
        'subscription.updatedAt': agora(),
      });
    }

    return { householdId, status: pagamento.status, duplicado: false };
  }

  /** Cancela no provedor primeiro: cancelar só no banco deixaria a cobrança viva. */
  async function cancelar(householdId, { motivo = null } = {}) {
    const household = await buscarHousehold(householdId);
    const externalId = household.subscription?.externalId;

    if (externalId) {
      await cliente().cancelarAssinatura(externalId);
    }

    await refHousehold(householdId).update({
      'subscription.status': STATUS.CANCELADA,
      'subscription.canceledAt': agora(),
      'subscription.cancelReason': motivo,
      'subscription.updatedAt': agora(),
      updatedAt: agora(),
    });

    await registrarEvento(householdId, `cancelamento-${Date.now()}`, {
      tipo: 'cancelamento',
      externalId: externalId || null,
      motivo,
    });

    return situacaoDaFamilia(householdId);
  }

  /**
   * Ativação manual pelo OPERADOR — Pix fora do sistema, negociação, cortesia
   * pontual. Ação de painel admin, nunca do cliente: por isso é uma função
   * separada, que nunca fala com o Mercado Pago, em vez de reaproveitar
   * `sincronizarDoProvedor`. Fica marcada como `provider: 'manual'` para não
   * se confundir com um pagamento de verdade do provedor.
   */
  async function registrarPagamentoManual(householdId, { diasDeAcesso = 30, motivo = null, registradoPor }) {
    const novoPeriodo = paraTimestamp(new Date(Date.now() + diasDeAcesso * 24 * 60 * 60 * 1000));

    await refHousehold(householdId).update({
      'subscription.status': STATUS.ATIVA,
      'subscription.provider': 'manual',
      'subscription.currentPeriodEnd': novoPeriodo,
      'subscription.updatedAt': agora(),
      updatedAt: agora(),
    });

    await registrarEvento(householdId, `manual-${Date.now()}`, {
      tipo: 'pagamento_manual', diasDeAcesso, motivo, registradoPor,
    });

    return situacaoDaFamilia(householdId);
  }

  /** Cortesia vitalícia — mesmo efeito de tools/marcar-conta-interna.js, agora acionável pelo painel. */
  async function marcarComoInterna(householdId, { registradoPor } = {}) {
    await refHousehold(householdId).update({
      'subscription.status': STATUS.ATIVA,
      'subscription.plan': PLANO_INTERNO,
      'subscription.priceCents': 0,
      'subscription.internalNote': 'Conta interna (cortesia). Fora do MRR por decisão, não por falha de cobrança.',
      'subscription.updatedAt': agora(),
      updatedAt: agora(),
    });

    await registrarEvento(householdId, `interna-${Date.now()}`, { tipo: 'marcada_interna', registradoPor });
    return situacaoDaFamilia(householdId);
  }

  async function desmarcarInterna(householdId, { registradoPor } = {}) {
    await refHousehold(householdId).update({
      'subscription.plan': 'familia',
      'subscription.updatedAt': agora(),
      updatedAt: agora(),
    });

    await registrarEvento(householdId, `desmarcar-interna-${Date.now()}`, { tipo: 'desmarcada_interna', registradoPor });
    return situacaoDaFamilia(householdId);
  }

  /**
   * Bloqueio manual do operador — fraude, abuso, pedido do próprio cliente
   * por fora do fluxo normal. `estado.js` dá prioridade a este campo sobre
   * trial/ativo/carência. Continua sendo só bloqueio de ESCRITA (regra 6):
   * quem está bloqueado assim ainda lê e exporta o próprio histórico.
   */
  async function bloquear(householdId, { motivo = null, registradoPor } = {}) {
    await refHousehold(householdId).update({
      'subscription.adminOverride.blocked': true,
      'subscription.adminOverride.reason': motivo,
      'subscription.adminOverride.blockedAt': agora(),
      'subscription.adminOverride.blockedBy': registradoPor || null,
      'subscription.updatedAt': agora(),
      updatedAt: agora(),
    });

    await registrarEvento(householdId, `bloqueio-${Date.now()}`, { tipo: 'bloqueio_manual', motivo, registradoPor });
    return situacaoDaFamilia(householdId);
  }

  async function desbloquear(householdId, { registradoPor } = {}) {
    await refHousehold(householdId).update({
      'subscription.adminOverride.blocked': false,
      'subscription.adminOverride.unblockedAt': agora(),
      'subscription.adminOverride.unblockedBy': registradoPor || null,
      'subscription.updatedAt': agora(),
      updatedAt: agora(),
    });

    await registrarEvento(householdId, `desbloqueio-${Date.now()}`, { tipo: 'desbloqueio_manual', registradoPor });
    return situacaoDaFamilia(householdId);
  }

  /**
   * Grava o evento com o id do provedor como id do documento.
   * Devolve false quando o evento já existia — é assim que a reentrega do
   * webhook para de contar duas vezes.
   */
  async function registrarEvento(householdId, eventoId, dados) {
    const ref = refHousehold(householdId).collection(EVENTOS).doc(String(eventoId));

    try {
      await ref.create({ ...dados, createdAt: agora() });
      return true;
    } catch (err) {
      // ALREADY_EXISTS (6) — o evento já foi processado.
      if (err.code === 6 || /already exists/i.test(err.message || '')) return false;
      throw err;
    }
  }

  async function listarEventos(householdId, limite = 24) {
    const snap = await refHousehold(householdId)
      .collection(EVENTOS)
      .orderBy('createdAt', 'desc')
      .limit(limite)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  return {
    situacaoDaFamilia,
    montarSituacao,
    iniciarCheckout,
    sincronizarDoProvedor,
    registrarPagamento,
    cancelar,
    registrarEvento,
    listarEventos,
    registrarPagamentoManual,
    marcarComoInterna,
    desmarcarInterna,
    bloquear,
    desbloquear,
  };
}

// Instância de produção. O require fica preguiçoso pelo mesmo motivo de
// escopo.js: quem importa só a fábrica (os testes) não arrasta o Firestore.
let _padrao = null;
function servico() {
  if (!_padrao) {
    const { admin, db } = require('../config/firebaseAdmin');
    const { clientePadrao } = require('../assinatura/mercadoPago');
    _padrao = criarServicoDeAssinatura({ db, admin, cliente: clientePadrao });
  }
  return _padrao;
}

module.exports = {
  criarServicoDeAssinatura,
  servico,
  situacaoDaFamilia: (...args) => servico().situacaoDaFamilia(...args),
  montarSituacao: (...args) => servico().montarSituacao(...args),
  iniciarCheckout: (...args) => servico().iniciarCheckout(...args),
  sincronizarDoProvedor: (...args) => servico().sincronizarDoProvedor(...args),
  registrarPagamento: (...args) => servico().registrarPagamento(...args),
  cancelar: (...args) => servico().cancelar(...args),
  listarEventos: (...args) => servico().listarEventos(...args),
  registrarPagamentoManual: (...args) => servico().registrarPagamentoManual(...args),
  marcarComoInterna: (...args) => servico().marcarComoInterna(...args),
  desmarcarInterna: (...args) => servico().desmarcarInterna(...args),
  bloquear: (...args) => servico().bloquear(...args),
  desbloquear: (...args) => servico().desbloquear(...args),
};
