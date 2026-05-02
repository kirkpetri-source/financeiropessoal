const whatsappLogService = require('../services/whatsappLogService');

async function list(req, res, next) {
  try {
    const result = await whatsappLogService.listLogs(req.userId, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
