const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const { categorySchema } = require('../validators/category');
const categoryController = require('../controllers/categoryController');

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

router.get('/', categoryController.list);
router.post('/', exigir('lancar'), validate(categorySchema), categoryController.create);
router.put('/:id', exigir('lancar'), validate(categorySchema), categoryController.update);
router.delete('/:id', exigir('lancar'), categoryController.remove);

module.exports = router;
