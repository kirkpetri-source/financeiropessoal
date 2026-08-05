const whatsappConfigService = require('../services/whatsappConfigService');

async function getConfig(req, res, next) {
  try { res.json(await whatsappConfigService.getConfig(req.householdId)); } catch (err) { next(err); }
}

async function updateConfig(req, res, next) {
  try { res.json(await whatsappConfigService.updateConfig(req.householdId, req.body)); } catch (err) { next(err); }
}

module.exports = { getConfig, updateConfig };
