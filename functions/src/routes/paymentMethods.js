const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir, exigirAssinatura } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const { paymentMethodSchema, paymentMethodUpdateSchema } = require('../validators/paymentMethod');
const paymentMethodController = require('../controllers/paymentMethodController');

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

router.get('/', paymentMethodController.list);
router.post('/', exigirAssinatura, exigir('lancar'), validate(paymentMethodSchema), paymentMethodController.create);
router.put('/:id', exigirAssinatura, exigir('lancar'), validate(paymentMethodUpdateSchema), paymentMethodController.update);
router.delete('/:id', exigirAssinatura, exigir('lancar'), paymentMethodController.remove);

module.exports = router;
