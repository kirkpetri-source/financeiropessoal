const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const { whatsappConfigSchema } = require('../validators/whatsappConfig');
const whatsappConfigController = require('../controllers/whatsappConfigController');
const whatsappLogController = require('../controllers/whatsappLogController');
const { pollForHousehold } = require('../services/whatsappPollingService');
const { getRawConfig } = require('../services/whatsappConfigService');
const { criarServicoDeInstancia } = require('../services/instanciaService');
const { exigirServidor, urlDoWebhook, MAX_MEMBROS } = require('../config/evolutionServidor');

const router = express.Router();

/**
 * Serviço de instância ligado ao mundo real.
 *
 * Montado sob demanda porque depende de secrets que só existem em tempo de
 * execução (a API key do servidor Evolution e o token do webhook).
 */
function servicoDeInstancia() {
  const { admin, db } = require('../config/firebaseAdmin');
  const provider = require('../canais/evolutionProvider');
  const householdService = require('../services/householdService');

  return criarServicoDeInstancia({
    db, admin, provider, householdService, webhookUrl: urlDoWebhook(),
  });
}

/** Credencial do servidor do operador — o cliente nunca informa nada disso. */
function configDoServidor() {
  const { url, apiKey } = exigirServidor();
  return { evolutionApiUrl: url, apiKey };
}

router.use(authMiddleware, resolverHousehold);

/* ---------------------------------------------------------------------- *
 * Onboarding do canal — os três passos que o cliente vê
 * ---------------------------------------------------------------------- */

/** Onde a família está no processo. A tela consulta em laço enquanto o QR está aberto. */
router.get('/status', async (req, res, next) => {
  try {
    res.json(await servicoDeInstancia().status(req.householdId, configDoServidor()));
  } catch (err) { next(err); }
});

/** Passo 1 — cria a instância e devolve o QR Code para ler no celular. */
router.post('/conectar', exigir('gerirCanal'), async (req, res, next) => {
  try {
    const config = { ...configDoServidor(), ...(await getRawConfig(req.householdId) || {}) };
    res.json(await servicoDeInstancia().conectar(req.householdId, config));
  } catch (err) { next(err); }
});

/**
 * Passo 2 — cria o grupo da família e devolve o link de convite.
 * Exige pelo menos um telefone: o WhatsApp não cria grupo de uma pessoa só.
 */
router.post('/grupo', exigir('gerirCanal'), async (req, res, next) => {
  try {
    const telefones = Array.isArray(req.body?.telefones)
      ? req.body.telefones
      : [req.body?.telefone].filter(Boolean);

    const resultado = await servicoDeInstancia().criarGrupoDaFamilia(
      req.householdId,
      configDoServidor(),
      { nomeDaFamilia: req.household?.name, telefones },
    );
    res.status(201).json(resultado);
  } catch (err) { next(err); }
});

/** Passo 3 — quem entrou no grupo vira membro autorizado a lançar. */
router.post('/membros/sincronizar', exigir('gerirCanal'), async (req, res, next) => {
  try {
    res.json(await servicoDeInstancia().sincronizarMembros(req.householdId, configDoServidor()));
  } catch (err) { next(err); }
});

router.post('/desconectar', exigir('gerirCanal'), async (req, res, next) => {
  try {
    const apagar = req.body?.apagar === true;
    res.json(await servicoDeInstancia().desconectar(req.householdId, configDoServidor(), { apagar }));
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------- *
 * Configuração e logs
 * ---------------------------------------------------------------------- */

router.get('/config', whatsappConfigController.getConfig);

// Continua existindo para a família #1, que roda em instância própria criada
// antes do provisionamento automático. Cliente novo não usa: a tela dele não
// tem esses campos.
router.put('/config', exigir('gerirCanal'), validate(whatsappConfigSchema), whatsappConfigController.updateConfig);

router.get('/logs', whatsappLogController.list);
router.delete('/logs/:id', exigir('lancar'), whatsappLogController.remove);

router.get('/limites', (req, res) => res.json({ maxMembros: MAX_MEMBROS }));

// Disparo manual do polling — botao "Verificar agora" da tela de WhatsApp.
router.post('/poll', exigir('lancar'), async (req, res, next) => {
  try {
    const config = await getRawConfig(req.householdId);

    if (!config || !config.enabled) {
      return res.json({ message: 'Integracao nao esta ativa.', processed: 0 });
    }
    if (!config.groupId || !config.evolutionApiUrl || !config.apiKey) {
      return res.json({ message: 'Configuracao incompleta.', processed: 0 });
    }

    const resultado = await pollForHousehold(req.householdId, config);
    res.json({ message: 'Verificacao concluida.', ...resultado });
  } catch (err) { next(err); }
});

module.exports = router;
