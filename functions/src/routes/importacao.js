const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir, exigirAssinaturaPaga } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const { analisarSchema, confirmarSchema } = require('../validators/importacao');
const importacaoController = require('../controllers/importacaoController');

/**
 * Importação de extrato bancário.
 *
 * `exigirAssinaturaPaga` (e não `exigirAssinatura`) porque o recurso não abre
 * no teste grátis: custa IA em lote e escrita em massa num plano de preço fixo.
 * Leitura do histórico de importações continua liberada — regra 6 do projeto:
 * bloqueio de assinatura nunca esconde dado que já é da família.
 */

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

router.get('/', importacaoController.listar);
router.get('/:id', importacaoController.buscar);

router.post('/analisar', exigirAssinaturaPaga, exigir('lancar'), validate(analisarSchema), importacaoController.analisar);
router.post('/:id/confirmar', exigirAssinaturaPaga, exigir('lancar'), validate(confirmarSchema), importacaoController.confirmar);
router.post('/:id/desfazer', exigirAssinaturaPaga, exigir('lancar'), importacaoController.desfazer);

module.exports = router;
