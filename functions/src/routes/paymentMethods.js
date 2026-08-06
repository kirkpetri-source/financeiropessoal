const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir, exigirAssinatura } = require('../middlewares/household');
const paymentMethodController = require('../controllers/paymentMethodController');

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

router.get('/', paymentMethodController.list);
router.post('/', exigirAssinatura, exigir('lancar'), paymentMethodController.create);
router.delete('/:id', exigirAssinatura, exigir('lancar'), paymentMethodController.remove);

module.exports = router;
