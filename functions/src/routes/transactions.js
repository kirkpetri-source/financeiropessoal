const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir, exigirAssinatura } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const { transactionSchema, transactionUpdateSchema } = require('../validators/transaction');
const transactionController = require('../controllers/transactionController');

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

// Leitor enxerga tudo da familia, mas nao lanca nem edita.
// A leitura tambem continua liberada para quem esta com a assinatura vencida:
// so a escrita passa por exigirAssinatura.
router.get('/', transactionController.list);
router.get('/summary', transactionController.summary);
router.post('/', exigirAssinatura, exigir('lancar'), validate(transactionSchema), transactionController.create);
router.put('/:id', exigirAssinatura, exigir('lancar'), validate(transactionUpdateSchema), transactionController.update);
router.delete('/:id', exigirAssinatura, exigir('lancar'), transactionController.remove);

module.exports = router;
