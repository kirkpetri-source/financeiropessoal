const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigirAssinaturaPaga, recursoPago } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const { perguntarSchema } = require('../validators/assistente');
const assistenteController = require('../controllers/assistenteController');

/**
 * Assistente de finanças.
 *
 * `exigirAssinaturaPaga` (e não `exigirAssinatura`) pelo mesmo motivo da
 * importação de extrato: cada pergunta custa IA de verdade, num plano de preço
 * fixo. `recursoPago` troca a mensagem da recusa — sem ele, quem pedisse para
 * conversar receberia um texto falando de importação de extrato.
 *
 * Ler o próprio histórico e o uso do dia NÃO passa pelo portão: são dados da
 * família, e regra 6 do projeto diz que bloqueio de assinatura nunca esconde
 * dado. Só PERGUNTAR — que é o que custa — exige assinatura paga.
 *
 * Não há `exigir('lancar')` na rota: um leitor pode conversar normalmente. O
 * que ele não recebe são as ferramentas de ESCRITA, filtradas por permissão lá
 * dentro (ver chatIAService.ferramentasPara).
 */

const router = express.Router();

router.use(authMiddleware, resolverHousehold);

router.get('/uso', assistenteController.uso);
router.get('/historico', assistenteController.historico);
router.delete('/historico', assistenteController.limpar);

router.post(
  '/perguntar',
  recursoPago('A assistente de finanças está disponível para assinantes. Assine para conversar sobre seus gastos.'),
  exigirAssinaturaPaga,
  validate(perguntarSchema),
  assistenteController.perguntar,
);

module.exports = router;
