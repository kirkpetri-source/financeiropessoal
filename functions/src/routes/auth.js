const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { registerSchema, updateProfileSchema } = require('../validators/auth');

const router = express.Router();

// Após criar conta via Firebase Auth no frontend, salva o perfil no Firestore
router.post('/register', authMiddleware, validate(registerSchema), authController.register);
router.get('/me', authMiddleware, authController.getProfile);
router.put('/me', authMiddleware, validate(updateProfileSchema), authController.updateProfile);

// PUT /me/password foi removido de propósito: o backend não tinha como conferir
// a senha atual e acabava permitindo tomada de conta com um token vazado.
// A troca acontece no frontend, via reauthenticateWithCredential + updatePassword.
router.put('/me/password', (req, res) => {
  res.status(410).json({
    error: 'Endpoint descontinuado. A troca de senha é feita pelo aplicativo.',
  });
});

module.exports = router;
