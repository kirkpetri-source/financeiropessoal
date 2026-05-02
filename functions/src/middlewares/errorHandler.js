const { ZodError } = require('zod');

function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    return res.status(400).json({ error: 'Dados inválidos.', details: messages });
  }

  console.error('[ERROR]', err);

  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Erro interno do servidor.';
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
