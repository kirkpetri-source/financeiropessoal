const plataforma = require('../services/chamadosPlataformaService');

/**
 * Quem está agindo vem SEMPRE de `req.operador`, preenchido pelo
 * `apenasOperadorAtivo` a partir do token. Nunca do corpo: senão o rastro em
 * `adminAuditLog` registraria quem o requisitante disse ser.
 */

async function fila(req, res, next) {
  try {
    res.json(await plataforma.listarFila({
      status: req.query.status || null,
      limite: req.query.limite,
    }));
  } catch (err) { next(err); }
}

async function operadores(req, res, next) {
  try {
    res.json(await plataforma.listarOperadoresAtivos());
  } catch (err) { next(err); }
}

async function detalhar(req, res, next) {
  try {
    res.json(await plataforma.abrirChamado(req.params.numero, req.operador));
  } catch (err) { next(err); }
}

async function responder(req, res, next) {
  try {
    const resultado = await plataforma.responderComoSuporte(
      req.params.numero, req.body, req.operador,
    );
    res.status(201).json(resultado);
  } catch (err) { next(err); }
}

async function encaminhar(req, res, next) {
  try {
    res.json(await plataforma.encaminhar(req.params.numero, req.body.paraUid, req.operador));
  } catch (err) { next(err); }
}

async function resolver(req, res, next) {
  try {
    res.json(await plataforma.resolverComoOperador(req.params.numero, req.operador));
  } catch (err) { next(err); }
}

module.exports = { fila, operadores, detalhar, responder, encaminhar, resolver };
