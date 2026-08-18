const assistenteService = require('../services/assistenteService');

/**
 * Assistente de finanças. Todas as rotas já passaram por `resolverHousehold`,
 * então `req.householdId` é a família autenticada — nunca vem do corpo.
 *
 * O INTERLOCUTOR também vem da sessão (`req.userId`), e não do cliente: é ele
 * que separa a memória de conversa entre as pessoas da mesma família, e aceitar
 * isso do corpo deixaria alguém ler a conversa de outro membro.
 */

function interlocutorDe(req) {
  return `user-${req.userId}`;
}

async function perguntar(req, res, next) {
  try {
    const resultado = await assistenteService.responder({
      householdId: req.householdId,
      pergunta: req.body.pergunta,
      interlocutor: interlocutorDe(req),
      permissoes: req.permissoes,
      nomeDaIA: req.household?.nomeDaAssistente || undefined,
      canal: 'PAINEL',
    });

    // Cota estourada não é erro do cliente nem falha do servidor: é uma
    // resposta legítima com um limite atingido. 429 é o código que diz isso.
    if (resultado.codigo === 'LIMITE_DIARIO') {
      return res.status(429).json(resultado);
    }
    if (resultado.codigo === 'DESLIGADA') {
      return res.status(503).json(resultado);
    }
    if (resultado.erro && resultado.codigo) {
      return res.status(400).json(resultado);
    }

    return res.json(resultado);
  } catch (err) {
    return next(err);
  }
}

async function uso(req, res, next) {
  try {
    res.json(await assistenteService.uso(req.householdId));
  } catch (err) {
    next(err);
  }
}

async function historico(req, res, next) {
  try {
    res.json(await assistenteService.historico({
      householdId: req.householdId,
      interlocutor: interlocutorDe(req),
    }));
  } catch (err) {
    next(err);
  }
}

async function limpar(req, res, next) {
  try {
    res.json(await assistenteService.limparConversa({
      householdId: req.householdId,
      interlocutor: interlocutorDe(req),
    }));
  } catch (err) {
    next(err);
  }
}

module.exports = { perguntar, uso, historico, limpar };
