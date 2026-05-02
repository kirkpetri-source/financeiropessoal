const whatsappConfigService = require('../services/whatsappConfigService');

async function getConfig(req, res, next) {
  try {
    const config = await whatsappConfigService.getConfig(req.userId);
    res.json(config);
  } catch (err) {
    next(err);
  }
}

async function updateConfig(req, res, next) {
  try {
    const config = await whatsappConfigService.updateConfig(req.userId, req.body);
    res.json(config);
  } catch (err) {
    next(err);
  }
}

module.exports = { getConfig, updateConfig };
