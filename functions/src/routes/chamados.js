const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const {
  aberturaSchema, respostaSchema, uploadSchema, apenasNumeroDeChamado,
} = require('../validators/chamado');
const chamadoController = require('../controllers/chamadoController');

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

/**
 * Só o DONO da conta abre e lê chamado.
 *
 * Hoje existe UM login por família — quem participa pelo WhatsApp é
 * `wa-<telefone>` e não tem senha —, então na prática isto não exclui ninguém.
 * Está explícito porque a decisão se revisita quando existir convite de membro
 * com login próprio: aí é preciso decidir se um `member` vê o chamado que fala
 * de cobrança da família.
 *
 * Não uso `exigir('gerirAssinatura')`, que também é só do dono: emprestar uma
 * permissão de cobrança para guardar suporte funcionaria hoje e enganaria quem
 * for mexer na matriz de papéis depois.
 */
function apenasDonoDaConta(req, res, next) {
  if (req.papel === 'owner') return next();

  return res.status(403).json({
    error: 'Só o titular da conta abre e acompanha chamados de suporte.',
    codigo: 'APENAS_DONO',
  });
}

router.use(apenasDonoDaConta);

/**
 * Nenhuma rota aqui passa por `exigirAssinatura`, e isso é deliberado (regra 6
 * do projeto).
 *
 * Suporte é o canal de quem tem problema — e o problema mais comum de quem está
 * com a assinatura vencida é justamente a cobrança. Exigir assinatura em dia
 * para falar sobre a assinatura fecharia a porta na cara de quem mais precisa
 * dela, e transformaria uma dúvida de pagamento em cancelamento.
 */
router.get('/chamados', chamadoController.listar);
router.post('/chamados', validate(aberturaSchema), chamadoController.abrir);
router.get('/chamados/:numero', apenasNumeroDeChamado, chamadoController.detalhar);
router.post('/chamados/:numero/mensagens', apenasNumeroDeChamado, validate(respostaSchema), chamadoController.responder);

/**
 * Anexos. O upload vem ANTES da mensagem: sobe, recebe os caminhos, e só então
 * manda a mensagem citando o que subiu. Assim um arquivo que falha não leva
 * junto o texto que a pessoa escreveu, e ela reenvia só o arquivo.
 *
 * O corpo desta rota tem limite próprio de 8 MB, montado em `app.js` antes do
 * parser global de 1 MB — mesmo padrão de `/importacao`.
 */
router.post('/anexos', validate(uploadSchema), chamadoController.subirAnexos);
router.get('/chamados/:numero/anexos/:anexoId', apenasNumeroDeChamado, chamadoController.baixarAnexo);

module.exports = router;
