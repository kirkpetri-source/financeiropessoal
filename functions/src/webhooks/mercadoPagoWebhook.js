const { assinaturaDoWebhookConfere } = require('../assinatura/mercadoPago');
const assinaturaService = require('../services/assinaturaService');

/**
 * Webhook do Mercado Pago.
 *
 * Duas armadilhas já conhecidas do projeto valem aqui:
 *
 * 1. **O Cloud Run congela a CPU quando a resposta HTTP sai.** Então o trabalho
 *    acontece ANTES do `res.json`. Responder 200 na primeira linha faria a
 *    ativação da assinatura morrer no meio, sem erro no log.
 *
 * 2. **Falha fechada na assinatura HMAC.** Sem `MERCADOPAGO_WEBHOOK_SECRET`
 *    configurado, nada é aceito. Um webhook de cobrança sem verificação é um
 *    botão de assinatura grátis exposto na internet: bastaria alguém postar
 *    `{"type":"subscription_preapproval","data":{"id":"..."}}`.
 *
 * Erro no processamento devolve 500 de propósito — o Mercado Pago reentrega, e
 * `registrarEvento` é idempotente, então reentrega não cobra duas vezes.
 */

const TIPOS = {
  ASSINATURA: 'subscription_preapproval',
  PAGAMENTO_DO_CICLO: 'subscription_authorized_payment',
};

function extrairTipo(req) {
  return req.body?.type || req.body?.topic || req.query?.type || req.query?.topic || null;
}

function extrairId(req) {
  // A assinatura HMAC é calculada sobre o `data.id` da query string quando ele
  // existe; o corpo é o caminho alternativo.
  return req.query?.['data.id'] || req.body?.data?.id || req.query?.id || null;
}

async function handleMercadoPagoWebhook(req, res) {
  const tipo = extrairTipo(req);
  const id = extrairId(req);

  // Sonda de conectividade do painel do Mercado Pago.
  //
  // Ao salvar a configuração do webhook, o painel bate na URL para conferir que
  // ela existe. Essa chamada vem sem assinatura e sem id — e, recebendo 401,
  // o painel recusa salvar com "não foi possível salvar seus ajustes".
  //
  // Responder 200 aqui não abre brecha: sem id não há o que processar, e este
  // caminho não executa nenhuma regra de negócio. Qualquer requisição que
  // carregue um id — ou seja, que peça alguma ação — continua exigindo
  // assinatura válida logo abaixo.
  if (!id && !req.headers['x-signature']) {
    console.log('[MP Webhook] Sonda de verificação respondida (sem id e sem assinatura).');
    return res.status(200).json({ recebido: true, verificacao: true });
  }

  const conferencia = assinaturaDoWebhookConfere({
    assinatura: req.headers['x-signature'],
    requestId: req.headers['x-request-id'],
    dataId: id,
    segredo: process.env.MERCADOPAGO_WEBHOOK_SECRET,
  });

  if (!conferencia.ok) {
    console.warn(`[MP Webhook] Recusado (${conferencia.motivo}). tipo=${tipo} ip=${req.ip}`);
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  if (!id) {
    return res.status(400).json({ error: 'Notificação sem id.' });
  }

  try {
    let resultado;

    switch (tipo) {
      case TIPOS.ASSINATURA:
        resultado = await assinaturaService.sincronizarDoProvedor(id);
        break;

      case TIPOS.PAGAMENTO_DO_CICLO:
        resultado = await assinaturaService.registrarPagamento(id);
        break;

      default:
        // `payment`, `plan`, `invoice` e afins chegam no mesmo endpoint e não
        // dizem nada que a assinatura já não diga. Confirmar o recebimento
        // evita reentrega infinita.
        console.log(`[MP Webhook] Tipo ignorado: ${tipo}`);
        return res.status(200).json({ recebido: true, ignorado: true, tipo });
    }

    console.log(`[MP Webhook] ${tipo} ${id}:`, JSON.stringify(resultado));
    return res.status(200).json({ recebido: true, ...resultado });
  } catch (err) {
    // 500 faz o Mercado Pago reentregar. É o comportamento desejado: perder uma
    // ativação de assinatura em silêncio é pior que processar de novo.
    console.error(`[MP Webhook] Falha em ${tipo} ${id}:`, err.message);
    return res.status(500).json({ error: 'Falha ao processar a notificação.' });
  }
}

/**
 * Checagem de alcance da URL (GET/HEAD).
 *
 * O painel do Mercado Pago confere se o endereço existe antes de aceitar a
 * configuração, e faz isso sem POST. Com a rota só em POST, o painel recebia
 * 404 e recusava salvar com "não foi possível salvar seus ajustes".
 *
 * Não processa nada e não revela nada: é o equivalente do /health, restrito a
 * dizer que o endpoint está de pé. Notificação de verdade continua chegando
 * por POST e continua exigindo assinatura válida.
 */
function handleMercadoPagoPing(req, res) {
  res.status(200).json({ status: 'ok', endpoint: 'mercadopago', metodo: 'notificações via POST' });
}

module.exports = { handleMercadoPagoWebhook, handleMercadoPagoPing, TIPOS, extrairTipo, extrairId };
