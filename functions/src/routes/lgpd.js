const express = require('express');
const { z } = require('zod');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const lgpdService = require('../services/lgpdService');

const router = express.Router();

// Palavra que o cliente digita para confirmar. Existe para que o pedido de
// exclusão nunca seja um clique acidental nem um POST disparado por engano.
const CONFIRMACAO = 'EXCLUIR';

const exclusaoSchema = z.object({
  confirmacao: z.literal(CONFIRMACAO, {
    errorMap: () => ({ message: `Digite ${CONFIRMACAO} para confirmar.` }),
  }),
  motivo: z.string().max(300).optional().nullable(),
});

router.use(authMiddleware, resolverHousehold);

/**
 * Portabilidade: baixa tudo em JSON.
 * Liberado para qualquer membro, inclusive leitor — é o dado da família dele —
 * e continua funcionando com a assinatura vencida, senão o bloqueio viraria
 * sequestro de dado.
 */
router.get('/exportar', async (req, res, next) => {
  try {
    const dados = await lgpdService.exportarDados(req.householdId, req.userEmail || req.userId);

    const nomeDoArquivo = `financeiro-familiar-${req.householdId}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeDoArquivo}"`);
    res.send(JSON.stringify(dados, null, 2));
  } catch (err) { next(err); }
});

/** Situação da exclusão, se houver pedido em aberto. */
router.get('/exclusao', async (req, res, next) => {
  try {
    const pedido = req.household?.deletion || null;
    res.json({
      solicitada: !!pedido,
      agendadaPara: pedido?.scheduledFor?.toDate?.().toISOString() || null,
      solicitadaPor: pedido?.requestedBy || null,
      diasDeArrependimento: lgpdService.DIAS_ATE_APAGAR,
    });
  } catch (err) { next(err); }
});

/**
 * Pede a exclusão da família inteira. Só o dono — é o histórico de todo mundo
 * que vai embora, não só o dele.
 */
router.post('/exclusao', exigir('gerirAssinatura'), validate(exclusaoSchema), async (req, res, next) => {
  try {
    const resultado = await lgpdService.solicitarExclusao(req.householdId, {
      solicitadoPor: req.userEmail || req.userId,
      motivo: req.body.motivo || null,
    });

    console.warn(`[LGPD] Exclusão solicitada para ${req.householdId} por ${req.userId}.`);
    res.status(202).json(resultado);
  } catch (err) { next(err); }
});

router.delete('/exclusao', exigir('gerirAssinatura'), async (req, res, next) => {
  try {
    res.json(await lgpdService.cancelarExclusao(req.householdId));
  } catch (err) { next(err); }
});

/** Sair da família sem apagar nada de ninguém. */
router.post('/sair', async (req, res, next) => {
  try {
    res.json(await lgpdService.sairDaFamilia(req.householdId, req.userId));
  } catch (err) { next(err); }
});

module.exports = router;
