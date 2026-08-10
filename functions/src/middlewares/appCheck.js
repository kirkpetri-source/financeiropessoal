/**
 * Confere o token do Firebase App Check nas rotas do painel.
 *
 * App Check confirma que quem chama a API é o app de verdade (o painel web
 * publicado em revelacash.com.br), não um script batendo direto no endpoint
 * com um token de usuário vazado por outro caminho. Complementa o
 * `authMiddleware` — App Check confere o APP, o `authMiddleware` confere o
 * USUÁRIO; os dois continuam necessários.
 *
 * Desligado por padrão (`APP_CHECK_ENFORCE` não setado): frontend só emite
 * token de App Check depois que existir um site key do reCAPTCHA v3
 * cadastrado no console (isso não é automatizável por CLI — precisa da conta
 * Google do Kirk, ver ESTADO.md). Ligar a exigência aqui antes disso
 * derrubaria a API inteira, sem nenhum cliente conseguindo passar.
 */
function criarAppCheckMiddleware(admin) {
  return async function appCheckMiddleware(req, res, next) {
    if (process.env.APP_CHECK_ENFORCE !== 'true') return next();

    const token = req.headers['x-firebase-appcheck'];
    if (!token) {
      return res.status(401).json({ error: 'Verificação do aplicativo ausente.' });
    }

    try {
      await admin.appCheck().verifyToken(token);
      next();
    } catch {
      res.status(401).json({ error: 'Verificação do aplicativo falhou.' });
    }
  };
}

let _padrao = null;
function appCheckMiddleware(req, res, next) {
  if (!_padrao) {
    const { admin } = require('../config/firebaseAdmin');
    _padrao = criarAppCheckMiddleware(admin);
  }
  return _padrao(req, res, next);
}

module.exports = appCheckMiddleware;
module.exports.criarAppCheckMiddleware = criarAppCheckMiddleware;
