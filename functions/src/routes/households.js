const express = require('express');
const { z } = require('zod');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const householdService = require('../services/householdService');

const router = express.Router();

const membroSchema = z.object({
  userId: z.string().min(1, 'userId obrigatorio.'),
  nome: z.string().min(1).max(60).optional().nullable(),
  email: z.string().email().optional().nullable(),
  telefone: z.string().max(20).optional().nullable(),
  papel: z.enum(['owner', 'member', 'viewer']).default('member'),
});

const membroUpdateSchema = z.object({
  nome: z.string().min(1).max(60).optional(),
  telefone: z.string().max(20).optional().nullable(),
  papel: z.enum(['owner', 'member', 'viewer']).optional(),
});

const householdUpdateSchema = z.object({
  nome: z.string().min(1).max(80),
});

router.use(authMiddleware, resolverHousehold);

// Dados da familia + membros + o papel de quem esta pedindo
router.get('/atual', async (req, res, next) => {
  try {
    const [familia, membros] = await Promise.all([
      householdService.buscarHousehold(req.householdId),
      householdService.listarMembros(req.householdId),
    ]);
    res.json({
      ...familia,
      membros,
      meuPapel: req.papel,
      minhasPermissoes: req.permissoes,
      assinaturaAtiva: householdService.assinaturaAtiva(familia),
    });
  } catch (err) { next(err); }
});

router.put('/atual', exigir('gerirMembros'), validate(householdUpdateSchema), async (req, res, next) => {
  try {
    res.json(await householdService.atualizarHousehold(req.householdId, req.body));
  } catch (err) { next(err); }
});

router.get('/atual/membros', async (req, res, next) => {
  try { res.json(await householdService.listarMembros(req.householdId)); } catch (err) { next(err); }
});

router.post('/atual/membros', exigir('gerirMembros'), validate(membroSchema), async (req, res, next) => {
  try {
    res.status(201).json(await householdService.adicionarMembro(req.householdId, req.body));
  } catch (err) { next(err); }
});

router.put('/atual/membros/:userId', exigir('gerirMembros'), validate(membroUpdateSchema), async (req, res, next) => {
  try {
    res.json(await householdService.atualizarMembro(req.householdId, req.params.userId, req.body));
  } catch (err) { next(err); }
});

router.delete('/atual/membros/:userId', exigir('gerirMembros'), async (req, res, next) => {
  try {
    res.json(await householdService.removerMembro(req.householdId, req.params.userId));
  } catch (err) { next(err); }
});

module.exports = router;
