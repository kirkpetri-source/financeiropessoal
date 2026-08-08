const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir, exigirAssinatura } = require('../middlewares/household');
const invoiceController = require('../controllers/creditCardInvoiceController');

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

router.get('/aberta', invoiceController.aberta);
router.get('/historico', invoiceController.historico);
router.post('/:id/pagar', exigirAssinatura, exigir('lancar'), invoiceController.pagar);

module.exports = router;
