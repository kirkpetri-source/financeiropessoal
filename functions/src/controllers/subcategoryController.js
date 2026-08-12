const subcategoryService = require('../services/subcategoryService');

async function list(req, res, next) {
  try {
    res.json(await subcategoryService.listSubcategories(req.dados, req.query.categoryId));
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try { res.status(201).json(await subcategoryService.createSubcategory(req.dados, req.body)); } catch (err) { next(err); }
}

async function update(req, res, next) {
  try { res.json(await subcategoryService.updateSubcategory(req.dados, req.params.id, req.body)); } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await subcategoryService.deleteSubcategory(req.dados, req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove };
