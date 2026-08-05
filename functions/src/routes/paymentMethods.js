const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir } = require('../middlewares/household');
const paymentMethodController = require('../controllers/paymentMethodController');

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

router.get('/', paymentMethodController.list);
router.post('/', exigir('lancar'), paymentMethodController.create);
router.delete('/:id', exigir('lancar'), paymentMethodController.remove);

module.exports = router;
