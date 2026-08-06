const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir, exigirAssinatura } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const { categorySchema } = require('../validators/category');
const categoryController = require('../controllers/categoryController');

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

router.get('/', categoryController.list);
router.post('/', exigirAssinatura, exigir('lancar'), validate(categorySchema), categoryController.create);
router.put('/:id', exigirAssinatura, exigir('lancar'), validate(categorySchema), categoryController.update);
router.delete('/:id', exigirAssinatura, exigir('lancar'), categoryController.remove);

module.exports = router;
