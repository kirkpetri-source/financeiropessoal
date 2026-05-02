const paymentMethodService = require('../services/paymentMethodService');

async function list(req, res, next) {
  try {
    const methods = await paymentMethodService.listPaymentMethods(req.userId);
    res.json(methods);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório.' });
    const method = await paymentMethodService.createPaymentMethod(req.userId, name);
    res.status(201).json(method);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await paymentMethodService.deletePaymentMethod(req.userId, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, remove };
