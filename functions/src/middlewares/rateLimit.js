const rateLimit = require('express-rate-limit');

/**
 * Limites de requisição por IP.
 *
 * Observação honesta sobre o alcance: o store é em memória, e cada instância
 * do Cloud Functions tem a sua. Com várias instâncias ativas o teto efetivo é
 * maior que o configurado. Isso segura flood trivial e engano de cliente, mas
 * não é defesa contra ataque distribuído — para isso a barreira real é o token
 * do webhook e o Firebase App Check (fase posterior).
 */

const respostaPadrao = { error: 'Muitas requisições. Tente novamente em instantes.' };

/**
 * O keyGenerator padrão do express-rate-limit valida `req.ip` e LANÇA
 * (ERR_ERL_UNDEFINED_IP_ADDRESS) se vier undefined, em vez de só tratar como
 * "sem IP". Em produção (atrás do Cloud Run) `req.ip` sempre existe; no
 * emulador de Functions local, o objeto de requisição não expõe isso — e sem
 * um keyGenerator próprio, TODA rota com rate limit (webhook, /auth/*,
 * geral) derrubava com 401/500 antes mesmo de chegar no authMiddleware,
 * inviabilizando qualquer teste local. Fallback simples, sem afetar produção.
 */
function chaveDeRequisicao(req) {
  return req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'sem-ip-local';
}

function criarLimite({ janelaMs, maximo, nome }) {
  return rateLimit({
    windowMs: janelaMs,
    max: maximo,
    standardHeaders: true,
    legacyHeaders: false,
    message: respostaPadrao,
    keyGenerator: chaveDeRequisicao,
    handler: (req, res) => {
      console.warn(`[RateLimit:${nome}] Bloqueado IP ${chaveDeRequisicao(req)} em ${req.method} ${req.originalUrl}`);
      res.status(429).json(respostaPadrao);
    },
  });
}

// Webhook: o Evolution manda uma requisição por mensagem recebida. Um grupo
// movimentado não passa de algumas dezenas por minuto.
const limiteWebhook = criarLimite({ janelaMs: 60 * 1000, maximo: 120, nome: 'webhook' });

// Endpoints de conta: troca de senha e criação de perfil. Baixa frequência.
const limiteAuth = criarLimite({ janelaMs: 15 * 60 * 1000, maximo: 20, nome: 'auth' });

// Disparo manual do polling: é caro (consulta a Evolution API e o Firestore).
const limitePolling = criarLimite({ janelaMs: 60 * 1000, maximo: 6, nome: 'polling' });

// Teto geral da API, folgado para não atrapalhar uso normal do painel.
const limiteGeral = criarLimite({ janelaMs: 60 * 1000, maximo: 300, nome: 'geral' });

module.exports = { limiteWebhook, limiteAuth, limitePolling, limiteGeral };
