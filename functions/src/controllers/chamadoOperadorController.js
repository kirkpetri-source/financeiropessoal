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

/**
 * Bytes do anexo. Mesmos headers do lado cliente
 * (`chamadoController.baixarAnexo`) — `attachment`/`nosniff` mesmo o
 * frontend consumindo como blob, e `filename*` por causa de acento.
 */
async function baixarAnexo(req, res, next) {
  try {
    const arquivo = await plataforma.baixarAnexo(req.params.numero, req.params.anexoId);

    const nome = encodeURIComponent(arquivo.nomeOriginal);
    res.setHeader('Content-Type', arquivo.mimeType);
    res.setHeader('Content-Length', arquivo.tamanho);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"; filename*=UTF-8''${nome}`);

    res.send(arquivo.conteudo);
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

async function avisosNaoEntregues(req, res, next) {
  try {
    res.json(await plataforma.notificacoesNaoEntregues());
  } catch (err) { next(err); }
}

async function darBaixaNoAviso(req, res, next) {
  try {
    res.json(await plataforma.resolverNotificacao(req.params.id, req.operador));
  } catch (err) { next(err); }
}

module.exports = {
  fila, operadores, detalhar, responder, encaminhar, resolver,
  avisosNaoEntregues, darBaixaNoAviso, baixarAnexo,
};
