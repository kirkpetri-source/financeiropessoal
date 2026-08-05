const paymentMethodService = require('../services/paymentMethodService');

async function list(req, res, next) {
  try { res.json(await paymentMethodService.listPaymentMethods(req.dados)); } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const nome = String(req.body?.name || '').trim();
    if (!nome) return res.status(400).json({ error: 'Nome obrigatorio.' });
    res.status(201).json(await paymentMethodService.createPaymentMethod(req.dados, nome));
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await paymentMethodService.deletePaymentMethod(req.dados, req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { list, create, remove };
