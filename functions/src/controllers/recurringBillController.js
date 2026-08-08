const recurringBillService = require('../services/recurringBillService');

async function list(req, res, next) {
  try { res.json(await recurringBillService.listRecurringBills(req.dados)); } catch (err) { next(err); }
}

async function proximas(req, res, next) {
  try { res.json(await recurringBillService.listarProximas(req.dados)); } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const bill = await recurringBillService.createRecurringBill(req.dados, req.body);
    res.status(201).json(bill);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    res.json(await recurringBillService.updateRecurringBill(req.dados, req.params.id, req.body));
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await recurringBillService.deleteRecurringBill(req.dados, req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { list, proximas, create, update, remove };
