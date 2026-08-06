const { admin } = require('../config/firebaseAdmin');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.userId = decoded.uid;
    req.userEmail = decoded.email;
    // E-mail não verificado é texto escolhido pelo usuário. O painel admin
    // autoriza por e-mail, então precisa saber a diferença.
    req.userEmailVerificado = decoded.email_verified === true;
    req.userClaims = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado. Faça login novamente.' });
  }
}

module.exports = authMiddleware;
