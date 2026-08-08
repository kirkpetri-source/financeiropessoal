const budgetService = require('../services/budgetService');
const { format } = require('date-fns');

async function list(req, res, next) {
  try { res.json(await budgetService.listBudgets(req.dados)); } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const budget = await budgetService.createBudget(req.dados, req.body);
    res.status(201).json(budget);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    res.json(await budgetService.updateBudget(req.dados, req.params.id, req.body));
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await budgetService.deleteBudget(req.dados, req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

async function resumo(req, res, next) {
  try {
    const month = req.query.month || format(new Date(), 'yyyy-MM');
    res.json(await budgetService.resumoDoMes(req.dados, month));
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove, resumo };
