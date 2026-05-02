const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/auth');

const router = express.Router();

// Após criar conta via Firebase Auth no frontend, salva o perfil no Firestore
router.post('/register', authMiddleware, authController.register);
router.get('/me', authMiddleware, authController.getProfile);
router.put('/me', authMiddleware, authController.updateProfile);
router.put('/me/password', authMiddleware, authController.changePassword);

module.exports = router;
