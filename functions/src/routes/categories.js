const express = require('express');
const authMiddleware = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { categorySchema } = require('../validators/category');
const categoryController = require('../controllers/categoryController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', categoryController.list);
router.post('/', validate(categorySchema), categoryController.create);
router.put('/:id', validate(categorySchema), categoryController.update);
router.delete('/:id', categoryController.remove);

module.exports = router;
