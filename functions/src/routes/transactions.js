const express = require('express');
const authMiddleware = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { transactionSchema, transactionUpdateSchema } = require('../validators/transaction');
const transactionController = require('../controllers/transactionController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', transactionController.list);
router.get('/summary', transactionController.summary);
router.post('/', validate(transactionSchema), transactionController.create);
router.put('/:id', validate(transactionUpdateSchema), transactionController.update);
router.delete('/:id', transactionController.remove);

module.exports = router;
