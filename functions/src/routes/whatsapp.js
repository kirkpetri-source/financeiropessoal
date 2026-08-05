const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const { whatsappConfigSchema } = require('../validators/whatsappConfig');
const whatsappConfigController = require('../controllers/whatsappConfigController');
const whatsappLogController = require('../controllers/whatsappLogController');
const { pollForHousehold } = require('../services/whatsappPollingService');
const { getRawConfig } = require('../services/whatsappConfigService');

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

router.get('/config', whatsappConfigController.getConfig);
router.put('/config', exigir('gerirCanal'), validate(whatsappConfigSchema), whatsappConfigController.updateConfig);

router.get('/logs', whatsappLogController.list);
router.delete('/logs/:id', exigir('lancar'), whatsappLogController.remove);

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
