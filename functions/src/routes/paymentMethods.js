const express = require('express');
const authMiddleware = require('../middlewares/auth');
const paymentMethodController = require('../controllers/paymentMethodController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', paymentMethodController.list);
router.post('/', paymentMethodController.create);
router.delete('/:id', paymentMethodController.remove);

module.exports = router;
