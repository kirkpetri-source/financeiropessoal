const whatsappLogService = require('../services/whatsappLogService');

async function list(req, res, next) {
  try { res.json(await whatsappLogService.listLogs(req.dados, req.query)); } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await whatsappLogService.deleteLog(req.dados, req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { list, remove };
