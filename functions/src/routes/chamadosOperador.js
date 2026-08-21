const express = require('express');
const authMiddleware = require('../middlewares/auth');
const apenasOperadorAtivo = require('../middlewares/operador');
const validate = require('../middlewares/validate');
const { respostaSchema, encaminharSchema } = require('../validators/chamado');
const controller = require('../controllers/chamadoOperadorController');

/**
 * Atendimento — a fila do suporte.
 *
 * ARQUIVO SEPARADO DE `admin.js`, E ISSO É REQUISITO, NÃO ESTILO.
 *
 * `routes/admin.js` faz `router.use(authMiddleware, apenasAdmin)` no topo, e no
 * Express isso vale para tudo que for registrado DEPOIS. Pendurar a fila lá
 * dentro exigiria `apenasAdmin` para atender chamado — e aí a coleção
 * `operadores`, com o papel ATENDENTE, não teria motivo nenhum para existir:
 * contratar um atendente significaria entregar o painel de faturamento junto.
 *
 * Em `app.js`, este router é montado ANTES de `/plataforma`. Inverter as duas
 * linhas faz `/plataforma/chamados/*` cair no router do admin, e todo atendente
 * vira administrador — sem erro nenhum aparecer. Existe um teste que lê o
 * `app.js` e confere essa ordem (`__testes__/ordemDasRotas.test.mjs`).
 */
const router = express.Router();

router.use(authMiddleware, apenasOperadorAtivo);

/**
 * `/operadores` ANTES de `/:numero`.
 *
 * O Express casa na ordem de registro: com `/:numero` primeiro, um GET em
 * `/operadores` entraria nele com `numero = 'operadores'` e voltaria 404. Não
 * quebraria nada visível no servidor — só a tela de encaminhamento, sem lista.
 */
router.get('/operadores', controller.operadores);
router.get('/avisos', controller.avisosNaoEntregues);
router.post('/avisos/:id/baixa', controller.darBaixaNoAviso);

router.get('/', controller.fila);
router.get('/:numero', controller.detalhar);
router.post('/:numero/mensagens', validate(respostaSchema), controller.responder);
router.post('/:numero/encaminhar', validate(encaminharSchema), controller.encaminhar);
router.post('/:numero/resolver', controller.resolver);

module.exports = router;
