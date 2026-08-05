const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const { transactionSchema, transactionUpdateSchema } = require('../validators/transaction');
const transactionController = require('../controllers/transactionController');

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

// Leitor enxerga tudo da familia, mas nao lanca nem edita.
router.get('/', transactionController.list);
router.get('/summary', transactionController.summary);
router.post('/', exigir('lancar'), validate(transactionSchema), transactionController.create);
router.put('/:id', exigir('lancar'), validate(transactionUpdateSchema), transactionController.update);
router.delete('/:id', exigir('lancar'), transactionController.remove);

module.exports = router;
