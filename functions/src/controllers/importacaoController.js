const importacaoService = require('../services/importacaoService');

/**
 * Importação de extrato. Todas as rotas já passaram por `resolverHousehold`,
 * então `req.householdId` é a família autenticada — nunca vem do corpo.
 */

async function analisar(req, res, next) {
  try {
    const resultado = await importacaoService.analisar({
      householdId: req.householdId,
      conteudo: req.body.conteudo,
      nomeArquivo: req.body.nomeArquivo || null,
      criadoPor: req.userId || null,
    });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

async function confirmar(req, res, next) {
  try {
    const resultado = await importacaoService.confirmar({
      householdId: req.householdId,
      batchId: req.params.id,
      escolhas: req.body.escolhas,
      criadoPor: req.userId || null,
    });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

async function desfazer(req, res, next) {
  try {
    res.json(await importacaoService.desfazer({
      householdId: req.householdId,
      batchId: req.params.id,
    }));
  } catch (err) {
    next(err);
  }
}

async function listar(req, res, next) {
  try {
    res.json(await importacaoService.listarLotes({ householdId: req.householdId }));
  } catch (err) {
    next(err);
  }
}

async function buscar(req, res, next) {
  try {
    res.json(await importacaoService.buscarLote({
      householdId: req.householdId,
      batchId: req.params.id,
    }));
  } catch (err) {
    next(err);
  }
}

module.exports = { analisar, confirmar, desfazer, listar, buscar };
