const chamadoService = require('../services/chamadoService');
const { AUTORES } = require('../chamados/estado');

/**
 * O nome de quem escreve sai do token e da família resolvida, nunca do corpo.
 * Deixar o cliente escolher o `autorNome` colocaria "Suporte RevelaCash" na
 * mensagem de quem quisesse.
 */
function quemEstaFalando(req) {
  return {
    autor: AUTORES.CLIENTE,
    autorNome: req.household?.ownerName || req.userEmail || null,
    abertoPor: { uid: req.userId, nome: req.userEmail || null },
  };
}

async function listar(req, res, next) {
  try {
    res.json(await chamadoService.listarChamados(req.dados));
  } catch (err) { next(err); }
}

async function abrir(req, res, next) {
  try {
    const criado = await chamadoService.abrirChamado(req.dados, {
      ...req.body,
      ...quemEstaFalando(req),
    });

    res.status(201).json(criado);
  } catch (err) { next(err); }
}

async function detalhar(req, res, next) {
  try {
    const chamado = await chamadoService.buscarChamado(req.dados, req.params.numero);
    if (!chamado) return res.status(404).json({ error: 'Chamado não encontrado.' });

    // Abrir a tela é ler: o indicador some aqui, não num botão que a pessoa
    // precise lembrar de clicar.
    await chamadoService.marcarComoLido(req.dados, req.params.numero, AUTORES.CLIENTE);

    return res.json({ ...chamado, naoLidoPeloCliente: false });
  } catch (err) { return next(err); }
}

async function responder(req, res, next) {
  try {
    const resultado = await chamadoService.responder(req.dados, req.params.numero, {
      ...req.body,
      ...quemEstaFalando(req),
    });

    res.status(201).json(resultado);
  } catch (err) { next(err); }
}

module.exports = { listar, abrir, detalhar, responder };
