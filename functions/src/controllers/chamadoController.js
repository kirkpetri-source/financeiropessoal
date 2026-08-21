const chamadoService = require('../services/chamadoService');
const anexoService = require('../services/anexoService');
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

/**
 * Caminhos citados no corpo viram metadados relidos do Storage.
 *
 * `metadadosDe` recusa caminho fora da pasta desta família e caminho que não
 * existe — é o que impede a mensagem de apontar para arquivo alheio ou para
 * arquivo nenhum.
 */
async function anexosDoCorpo(req) {
  const caminhos = req.body.anexos;
  if (!caminhos?.length) return [];

  return anexoService.metadadosDe(req.householdId, caminhos);
}

async function listar(req, res, next) {
  try {
    res.json(await chamadoService.listarChamados(req.dados));
  } catch (err) { next(err); }
}

async function abrir(req, res, next) {
  try {
    const { anexos: _caminhos, ...corpo } = req.body;

    const criado = await chamadoService.abrirChamado(req.dados, {
      ...corpo,
      anexos: await anexosDoCorpo(req),
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
    const { anexos: _caminhos, ...corpo } = req.body;

    const resultado = await chamadoService.responder(req.dados, req.params.numero, {
      ...corpo,
      anexos: await anexosDoCorpo(req),
      ...quemEstaFalando(req),
    });

    res.status(201).json(resultado);
  } catch (err) { next(err); }
}

/**
 * Sobe arquivos e devolve os caminhos, para a mensagem citá-los depois.
 *
 * Responde 200 mesmo quando parte falhou: a lista de `falharam` é resultado,
 * não erro. Devolver 4xx aqui faria a tela descartar os que subiram bem e a
 * pessoa reenviaria tudo.
 */
async function subirAnexos(req, res, next) {
  try {
    res.json(await anexoService.subirArquivos(req.householdId, req.body.arquivos));
  } catch (err) { next(err); }
}

/**
 * Devolve os BYTES do anexo. Sem signed URL (decisão do Kirk em 21/08/2026).
 *
 * O cliente manda número do chamado e id do anexo — nunca um caminho. Quem
 * transforma isso em caminho é o próprio chamado, que só é lido através do
 * `escopoDe`. Assim o caminho jamais vem de fora, e o anexo de outro chamado
 * da mesma família também não abre por aqui.
 */
async function baixarAnexo(req, res, next) {
  try {
    const naoEncontrado = () => res.status(404).json({ error: 'Anexo não encontrado.' });

    const chamado = await chamadoService.buscarChamado(req.dados, req.params.numero);
    if (!chamado) return naoEncontrado();

    const anexo = (chamado.mensagens || [])
      .flatMap((m) => m.anexos || [])
      .find((a) => a.id === req.params.anexoId);

    if (!anexo) return naoEncontrado();

    const arquivo = await anexoService.lerAnexo(req.householdId, anexo.storagePath);

    // `attachment` e `nosniff` mesmo o frontend consumindo como blob: se um dia
    // alguém abrir esta URL direto, o navegador não executa nada no nosso
    // domínio. `filename*` porque nome de arquivo em português tem acento, e
    // acento em cabeçalho HTTP sem codificar vira lixo.
    const nome = encodeURIComponent(arquivo.nomeOriginal);
    res.setHeader('Content-Type', arquivo.mimeType);
    res.setHeader('Content-Length', arquivo.tamanho);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"; filename*=UTF-8''${nome}`);

    return res.send(arquivo.conteudo);
  } catch (err) { return next(err); }
}

module.exports = { listar, abrir, detalhar, responder, subirAnexos, baixarAnexo };
