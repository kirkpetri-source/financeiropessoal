const crypto = require('crypto');
const { STATUS, PRECO_MENSAL_CENTAVOS } = require('./estado');

/**
 * Mercado Pago — assinatura recorrente (preapproval).
 *
 * Escolha do Kirk. A taxa pesa mais que Asaas ou AbacatePay num ticket de
 * R$ 24,90, mas a marca reduz atrito na hora de vender para família.
 *
 * Modelo usado: **preapproval sem plano**, com valor no próprio corpo. Evita
 * ter que criar e versionar `preapproval_plan` no painel; se o preço mudar,
 * muda em `PRECO_MENSAL_CENTAVOS` e as assinaturas novas já saem no preço novo
 * (as antigas seguem no preço contratado, que é o comportamento correto).
 *
 * O cliente HTTP entra por injeção (`fetchImpl`) porque a suíte não pode
 * encostar na API real — e mock de módulo já provou que falha em silêncio
 * neste projeto.
 */

const BASE = 'https://api.mercadopago.com';

// Tolerância do carimbo de tempo do webhook. Assinatura válida mas antiga é
// tentativa de replay: o Mercado Pago entrega em segundos, não em horas.
const TOLERANCIA_ASSINATURA_MS = 10 * 60 * 1000;

/** status do Mercado Pago -> status interno */
const MAPA_DE_STATUS = {
  pending: STATUS.PENDENTE,
  authorized: STATUS.ATIVA,
  paused: STATUS.PAUSADA,
  cancelled: STATUS.CANCELADA,
};

function traduzirStatus(statusDoProvedor) {
  return MAPA_DE_STATUS[statusDoProvedor] || null;
}

function centavosParaReais(centavos) {
  return Math.round(centavos) / 100;
}

/**
 * O `reason` do preapproval é o que o cliente vê na fatura do cartão.
 *
 * Descrição específica de propósito: o suporte do Mercado Pago (13/08/2026)
 * apontou `reason` genérico como um dos fatores que alimentam o antifraude
 * (`cc_rejected_high_risk`) numa aplicação nova — "Financeiro Familiar"
 * sozinho não diz o que é cobrado nem quem cobra.
 *
 * O limite de 60 caracteres é do Mercado Pago e NÃO está documentado na
 * página de assinaturas: só aparece como `400 reason has more than 60
 * characters` na hora de criar. Custou o checkout fora do ar em produção
 * (13/08/2026) com uma descrição de 62 caracteres. Por isso o texto é
 * truncado aqui em vez de confiar em quem chama: derrubar o pagamento do
 * cliente por causa de um texto comprido é o pior desfecho possível.
 */
const LIMITE_DO_REASON = 60;
const MOTIVO_PADRAO = 'RevelaCash - assinatura mensal do controle financeiro';

function encurtarMotivo(motivo) {
  const limpo = String(motivo || MOTIVO_PADRAO).trim();
  return limpo.length <= LIMITE_DO_REASON ? limpo : limpo.slice(0, LIMITE_DO_REASON).trim();
}

/**
 * Confere a assinatura HMAC do webhook.
 *
 * O Mercado Pago manda `x-signature: ts=<epoch>,v1=<hmac>` e `x-request-id`.
 * O manifesto assinado é `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`,
 * com o id em minúsculas.
 *
 * Falha fechada: sem segredo configurado, nada é aceito. Um webhook de
 * cobrança sem verificação é um botão de "assinatura vitalícia grátis" aberto
 * na internet.
 */
function assinaturaDoWebhookConfere({ assinatura, requestId, dataId, segredo, agora = Date.now() }) {
  if (!segredo) return { ok: false, motivo: 'SEGREDO_AUSENTE' };
  if (!assinatura || !dataId) return { ok: false, motivo: 'CABECALHO_AUSENTE' };

  const partes = Object.fromEntries(
    String(assinatura)
      .split(',')
      .map((p) => p.split('=').map((s) => s.trim()))
      .filter((p) => p.length === 2)
  );

  const { ts, v1 } = partes;
  if (!ts || !v1) return { ok: false, motivo: 'CABECALHO_MALFORMADO' };

  const carimbo = Number(ts) * 1000;
  if (!Number.isFinite(carimbo) || Math.abs(agora - carimbo) > TOLERANCIA_ASSINATURA_MS) {
    return { ok: false, motivo: 'CARIMBO_FORA_DA_JANELA' };
  }

  const manifesto = `id:${String(dataId).toLowerCase()};request-id:${requestId || ''};ts:${ts};`;
  const esperado = crypto.createHmac('sha256', segredo).update(manifesto).digest('hex');

  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(String(v1), 'utf8');
  if (a.length !== b.length) return { ok: false, motivo: 'ASSINATURA_INVALIDA' };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, motivo: 'ASSINATURA_INVALIDA' };

  return { ok: true };
}

function criarClienteMercadoPago({ accessToken, fetchImpl = globalThis.fetch } = {}) {
  function exigirToken() {
    if (!accessToken) {
      throw Object.assign(
        new Error('MERCADOPAGO_ACCESS_TOKEN não configurado — cobrança indisponível.'),
        { statusCode: 503 }
      );
    }
  }

  async function chamar(metodo, caminho, corpo, { idempotencyKey } = {}) {
    exigirToken();

    const cabecalhos = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    // Sem isso, um retry de rede pode virar duas assinaturas para a mesma família.
    if (idempotencyKey) cabecalhos['X-Idempotency-Key'] = idempotencyKey;

    const resposta = await fetchImpl(`${BASE}${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });

    const texto = await resposta.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { dados = null; }

    if (!resposta.ok) {
      const detalhe = dados?.message || texto?.slice(0, 300) || '';
      throw Object.assign(
        new Error(`Mercado Pago ${resposta.status}: ${detalhe}`),
        { statusCode: resposta.status >= 500 ? 502 : 400, provedor: dados }
      );
    }

    return dados;
  }

  return {
    /**
     * Cria a assinatura e devolve o link de pagamento.
     * `external_reference` carrega o householdId — é o que amarra o webhook do
     * Mercado Pago à família certa sem depender de e-mail.
     */
    async criarAssinatura({
      householdId, email, urlDeRetorno, precoCentavos = PRECO_MENSAL_CENTAVOS,
      motivo = MOTIVO_PADRAO,
    }) {
      if (!householdId) throw Object.assign(new Error('householdId obrigatório.'), { statusCode: 400 });
      if (!email) throw Object.assign(new Error('E-mail do pagador obrigatório.'), { statusCode: 400 });

      const dados = await chamar('POST', '/preapproval', {
        // Truncado, não recusado: um `reason` comprido não pode ser o motivo
        // de um cliente não conseguir pagar. Ver LIMITE_DO_REASON.
        reason: encurtarMotivo(motivo),
        external_reference: householdId,
        payer_email: email,
        back_url: urlDeRetorno,
        status: 'pending',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: centavosParaReais(precoCentavos),
          currency_id: 'BRL',
        },
      }, { idempotencyKey: `assinatura-${householdId}-${Date.now()}` });

      return {
        id: dados?.id || null,
        linkDePagamento: dados?.init_point || dados?.sandbox_init_point || null,
        status: traduzirStatus(dados?.status) || STATUS.PENDENTE,
        bruto: dados,
      };
    },

    /**
     * Cria um PLANO de assinatura e devolve o link público de checkout.
     *
     * É o caminho que permite ao cliente pagar SEM TER CONTA no Mercado Pago
     * — a tela do plano oferece "Sem conta Mercado Pago → Cartão de crédito"
     * e pede só os dados do cartão. O fluxo antigo (`criarAssinatura`, que
     * manda `payer_email`) obriga a pessoa a entrar com a conta Mercado Pago
     * daquele e-mail exato, e trava com "e-mail não confere" para quem
     * cadastrou no RevelaCash um e-mail diferente do da conta dela — ou para
     * quem simplesmente não tem conta. Verificado no checkout real em
     * 13/08/2026.
     *
     * Um plano POR FAMÍLIA, com o householdId em `external_reference`: é o que
     * amarra a assinatura de volta à família certa quando o webhook chega.
     */
    async criarPlano({ householdId, urlDeRetorno, precoCentavos = PRECO_MENSAL_CENTAVOS, motivo = MOTIVO_PADRAO }) {
      if (!householdId) throw Object.assign(new Error('householdId obrigatório.'), { statusCode: 400 });

      const dados = await chamar('POST', '/preapproval_plan', {
        reason: encurtarMotivo(motivo),
        external_reference: householdId,
        back_url: urlDeRetorno,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: centavosParaReais(precoCentavos),
          currency_id: 'BRL',
        },
      }, { idempotencyKey: `plano-${householdId}-${Date.now()}` });

      return {
        id: dados?.id || null,
        linkDePagamento: dados?.init_point || null,
        status: dados?.status || null,
        bruto: dados,
      };
    },

    async buscarPlano(planId) {
      const dados = await chamar('GET', `/preapproval_plan/${encodeURIComponent(planId)}`);
      return {
        id: dados?.id || null,
        householdId: dados?.external_reference || null,
        status: dados?.status || null,
        linkDePagamento: dados?.init_point || null,
        bruto: dados,
      };
    },

    async buscarAssinatura(preapprovalId) {
      const dados = await chamar('GET', `/preapproval/${encodeURIComponent(preapprovalId)}`);
      return {
        id: dados?.id || null,
        householdId: dados?.external_reference || null,
        // Assinatura nascida de um plano carrega o id dele. É o segundo
        // caminho para achar a família quando o preapproval vem sem
        // external_reference próprio (o cliente assinou pelo link do plano,
        // não por um preapproval que nós criamos com os dados dele).
        planId: dados?.preapproval_plan_id || null,
        status: traduzirStatus(dados?.status),
        statusDoProvedor: dados?.status || null,
        proximoPagamento: dados?.next_payment_date || null,
        valorCentavos: dados?.auto_recurring?.transaction_amount != null
          ? Math.round(dados.auto_recurring.transaction_amount * 100)
          : null,
        bruto: dados,
      };
    },

    /**
     * Pagamento de um ciclo. O webhook de `subscription_authorized_payment`
     * manda o id disto, não o da assinatura.
     */
    async buscarPagamentoAutorizado(id) {
      const dados = await chamar('GET', `/authorized_payments/${encodeURIComponent(id)}`);
      return {
        id: dados?.id || null,
        assinaturaId: dados?.preapproval_id || null,
        status: dados?.status || null,          // processed | recycling | cancelled | scheduled
        pagamentoStatus: dados?.payment?.status || null,
        valorCentavos: dados?.transaction_amount != null
          ? Math.round(dados.transaction_amount * 100)
          : null,
        bruto: dados,
      };
    },

    async cancelarAssinatura(preapprovalId) {
      const dados = await chamar('PUT', `/preapproval/${encodeURIComponent(preapprovalId)}`, {
        status: 'cancelled',
      });
      return { id: dados?.id || null, status: traduzirStatus(dados?.status), bruto: dados };
    },

    async pausarAssinatura(preapprovalId) {
      const dados = await chamar('PUT', `/preapproval/${encodeURIComponent(preapprovalId)}`, {
        status: 'paused',
      });
      return { id: dados?.id || null, status: traduzirStatus(dados?.status), bruto: dados };
    },

    async retomarAssinatura(preapprovalId) {
      const dados = await chamar('PUT', `/preapproval/${encodeURIComponent(preapprovalId)}`, {
        status: 'authorized',
      });
      return { id: dados?.id || null, status: traduzirStatus(dados?.status), bruto: dados };
    },
  };
}

/** Cliente de produção, montado sob demanda para o secret já estar carregado. */
function clientePadrao() {
  return criarClienteMercadoPago({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });
}

module.exports = {
  BASE,
  TOLERANCIA_ASSINATURA_MS,
  MAPA_DE_STATUS,
  LIMITE_DO_REASON,
  MOTIVO_PADRAO,
  encurtarMotivo,
  traduzirStatus,
  centavosParaReais,
  assinaturaDoWebhookConfere,
  criarClienteMercadoPago,
  clientePadrao,
};
