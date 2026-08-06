const express = require('express');
const { z } = require('zod');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const householdService = require('../services/householdService');
const { validarCelular } = require('../utils/telefoneBR');

const router = express.Router();

/**
 * Telefone validado e já normalizado para o formato do WhatsApp.
 *
 * O backend é a fonte da verdade: a máscara da tela ajuda, mas quem chama a
 * API direto — ou um formulário com bug — não pode gravar `6499715453` e
 * deixar os gastos da pessoa sem atribuição, como já aconteceu.
 */
const telefoneSchema = z.string()
  .transform((v) => (v ?? '').trim())
  .superRefine((valor, ctx) => {
    if (!valor) return;
    const r = validarCelular(valor);
    if (!r.valido) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.erro });
  })
  .transform((valor) => (valor ? validarCelular(valor).e164 : null));

const membroSchema = z.object({
  userId: z.string().min(1, 'userId obrigatorio.'),
  nome: z.string().min(1).max(60).optional().nullable(),
  email: z.string().email().optional().nullable(),
  telefone: telefoneSchema.optional().nullable(),
  papel: z.enum(['owner', 'member', 'viewer']).default('member'),
});

const membroUpdateSchema = z.object({
  nome: z.string().min(1).max(60).optional(),
  telefone: telefoneSchema.optional().nullable(),
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
