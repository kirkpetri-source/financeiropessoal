const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir, exigirAssinatura } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const { recurringBillSchema, recurringBillUpdateSchema } = require('../validators/recurringBill');
const recurringBillController = require('../controllers/recurringBillController');

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

router.get('/', recurringBillController.list);
router.get('/proximas', recurringBillController.proximas);
router.post('/', exigirAssinatura, exigir('lancar'), validate(recurringBillSchema), recurringBillController.create);
router.put('/:id', exigirAssinatura, exigir('lancar'), validate(recurringBillUpdateSchema), recurringBillController.update);
router.delete('/:id', exigirAssinatura, exigir('lancar'), recurringBillController.remove);

module.exports = router;
