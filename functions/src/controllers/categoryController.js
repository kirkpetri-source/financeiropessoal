const categoryService = require('../services/categoryService');

async function list(req, res, next) {
  try { res.json(await categoryService.listCategories(req.dados)); } catch (err) { next(err); }
}

async function create(req, res, next) {
  try { res.status(201).json(await categoryService.createCategory(req.dados, req.body)); } catch (err) { next(err); }
}

async function update(req, res, next) {
  try { res.json(await categoryService.updateCategory(req.dados, req.params.id, req.body)); } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await categoryService.deleteCategory(req.dados, req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove };
