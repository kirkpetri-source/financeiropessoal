const transactionService = require('../services/transactionService');
const { format } = require('date-fns');

async function list(req, res, next) {
  try {
    const transactions = await transactionService.listTransactions(req.userId, req.query);
    res.json(transactions);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const transaction = await transactionService.createTransaction(req.userId, req.body);
    res.status(201).json(transaction);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const transaction = await transactionService.updateTransaction(req.userId, req.params.id, req.body);
    res.json(transaction);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await transactionService.deleteTransaction(req.userId, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function summary(req, res, next) {
  try {
    const month = req.query.month || format(new Date(), 'yyyy-MM');
    const data = await transactionService.getMonthlySummary(req.userId, month);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove, summary };
