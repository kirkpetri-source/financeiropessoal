const whatsappLogService = require('../services/whatsappLogService');

async function list(req, res, next) {
  try {
    const result = await whatsappLogService.listLogs(req.userId, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await whatsappLogService.deleteLog(req.userId, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, remove };
