const express = require('express');
const authMiddleware = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { whatsappConfigSchema } = require('../validators/whatsappConfig');
const whatsappConfigController = require('../controllers/whatsappConfigController');
const whatsappLogController = require('../controllers/whatsappLogController');
const { pollForUser } = require('../services/whatsappPollingService');
const { getRawConfig } = require('../services/whatsappConfigService');

const router = express.Router();

router.use(authMiddleware);

router.get('/config', whatsappConfigController.getConfig);
router.put('/config', validate(whatsappConfigSchema), whatsappConfigController.updateConfig);
router.get('/logs', whatsappLogController.list);

// Disparo manual do polling — chamado pelo botão Atualizar do frontend
router.post('/poll', async (req, res, next) => {
  try {
    const config = await getRawConfig(req.userId);

    if (!config || !config.enabled) {
      return res.json({ message: 'Integração não está ativa.', processed: 0 });
    }

    if (!config.groupId || !config.evolutionApiUrl || !config.apiKey) {
      return res.json({ message: 'Configuração incompleta.', processed: 0 });
    }

    const result = await pollForUser(req.userId, config);
    res.json({ message: `Verificação concluída.`, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
