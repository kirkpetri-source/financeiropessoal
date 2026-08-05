const transactionService = require('../services/transactionService');
const { format } = require('date-fns');

async function list(req, res, next) {
  try {
    res.json(await transactionService.listTransactions(req.dados, req.query));
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const transacao = await transactionService.createTransaction(req.dados, req.body, req.userId);
    res.status(201).json(transacao);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    res.json(await transactionService.updateTransaction(req.dados, req.params.id, req.body));
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await transactionService.deleteTransaction(req.dados, req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

async function summary(req, res, next) {
  try {
    const month = req.query.month || format(new Date(), 'yyyy-MM');
    // paidBy faz o filtro por pessoa valer para os graficos tambem, e nao so
    // para os totais como era antes.
    res.json(await transactionService.getMonthlySummary(req.dados, month, req.query.paidBy || null));
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove, summary };
