const authService = require('../services/authService');

// Chamado logo após o registro pelo Firebase Auth no frontend
// Salva o perfil (nome) no Firestore
async function register(req, res, next) {
  try {
    const { name, email } = req.body;
    const user = await authService.createOrUpdateProfile(req.userId, { name, email });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

async function getProfile(req, res, next) {
  try {
    const user = await authService.getProfile(req.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { name, email } = req.body;
    const user = await authService.updateProfile(req.userId, name, email);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { newPassword } = req.body;
    await authService.changePassword(req.userId, newPassword);
    res.json({ message: 'Senha alterada com sucesso.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, getProfile, updateProfile, changePassword };
