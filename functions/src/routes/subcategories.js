const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir, exigirAssinatura } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const { subcategorySchema } = require('../validators/subcategory');
const subcategoryController = require('../controllers/subcategoryController');

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

router.get('/', subcategoryController.list);
router.post('/', exigirAssinatura, exigir('lancar'), validate(subcategorySchema), subcategoryController.create);
router.put('/:id', exigirAssinatura, exigir('lancar'), validate(subcategorySchema), subcategoryController.update);
router.delete('/:id', exigirAssinatura, exigir('lancar'), subcategoryController.remove);

module.exports = router;
