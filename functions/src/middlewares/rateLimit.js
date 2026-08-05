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

function criarLimite({ janelaMs, maximo, nome }) {
  return rateLimit({
    windowMs: janelaMs,
    max: maximo,
    standardHeaders: true,
    legacyHeaders: false,
    message: respostaPadrao,
    handler: (req, res) => {
      console.warn(`[RateLimit:${nome}] Bloqueado IP ${req.ip} em ${req.method} ${req.originalUrl}`);
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
