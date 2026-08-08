const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir, exigirAssinatura } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const { budgetSchema, budgetUpdateSchema } = require('../validators/budget');
const budgetController = require('../controllers/budgetController');

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

router.get('/', budgetController.list);
router.get('/resumo', budgetController.resumo);
router.post('/', exigirAssinatura, exigir('lancar'), validate(budgetSchema), budgetController.create);
router.put('/:id', exigirAssinatura, exigir('lancar'), validate(budgetUpdateSchema), budgetController.update);
router.delete('/:id', exigirAssinatura, exigir('lancar'), budgetController.remove);

module.exports = router;
