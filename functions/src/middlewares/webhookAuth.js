const crypto = require('crypto');

/**
 * Autentica o webhook do Evolution por token secreto no caminho da URL.
 *
 * O Evolution não assina o payload nem manda header de autenticação, então o
 * segredo vai na própria URL configurada na instância:
 *   POST /api/webhooks/evolution/<TOKEN>
 *
 * Sem isso, qualquer um que descubra a URL cria lançamento no financeiro de
 * qualquer família — basta acertar o groupId.
 *
 * Falha fechada: se o segredo não estiver configurado no ambiente, o webhook
 * rejeita tudo. O polling continua funcionando como caminho alternativo, então
 * nenhum lançamento é perdido enquanto o token não é configurado.
 */

// Comparação em tempo constante — evita descobrir o token por diferença de tempo.
function comparaSegredo(recebido, esperado) {
  const a = Buffer.from(String(recebido));
  const b = Buffer.from(String(esperado));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function webhookAuth(req, res, next) {
  const esperado = process.env.EVOLUTION_WEBHOOK_TOKEN;

  if (!esperado) {
    console.error('[WebhookAuth] EVOLUTION_WEBHOOK_TOKEN não configurado — webhook recusado.');
    return res.status(503).json({ error: 'Webhook não configurado no servidor.' });
  }

  const recebido = req.params.token || '';

  if (!recebido || !comparaSegredo(recebido, esperado)) {
    // Não registra o token recebido no log, para não vazar tentativa em log compartilhado.
    console.warn('[WebhookAuth] Token inválido. IP:', req.ip);
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  next();
}

module.exports = { webhookAuth, comparaSegredo };
