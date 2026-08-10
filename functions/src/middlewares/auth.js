/**
 * Verifica o ID token do Firebase em toda rota autenticada.
 *
 * `verificarToken` entra por parâmetro (fábrica), mesmo motivo do padrão em
 * escopo.js: importar `config/firebaseAdmin` direto arrastaria a trava que
 * recusa carregar sob VITEST sem emulador. O teste injeta uma função dublê,
 * nunca um mock de módulo.
 */
function criarAuthMiddleware(verificarToken) {
  return async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = await verificarToken(token);
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
  };
}

let _padrao = null;
function authMiddleware(req, res, next) {
  if (!_padrao) {
    const { admin } = require('../config/firebaseAdmin');
    _padrao = criarAuthMiddleware((token) => admin.auth().verifyIdToken(token));
  }
  return _padrao(req, res, next);
}

module.exports = authMiddleware;
module.exports.criarAuthMiddleware = criarAuthMiddleware;
