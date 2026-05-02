const express = require('express');
const authMiddleware = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { whatsappConfigSchema } = require('../validators/whatsappConfig');
const whatsappConfigController = require('../controllers/whatsappConfigController');
const whatsappLogController = require('../controllers/whatsappLogController');

const router = express.Router();

router.use(authMiddleware);

router.get('/config', whatsappConfigController.getConfig);
router.put('/config', validate(whatsappConfigSchema), whatsappConfigController.updateConfig);
router.get('/logs', whatsappLogController.list);

module.exports = router;
