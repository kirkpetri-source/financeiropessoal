const { z } = require('zod');

const budgetSchema = z.object({
  categoryId: z.string().min(1, 'Categoria obrigatória.'),
  monthlyLimitCents: z.number({ required_error: 'Limite obrigatório.' }).int().positive('Limite deve ser positivo.'),
  active: z.boolean().optional(),
});

// Sem .default(): corpo que não menciona um campo não pode sobrescrevê-lo com
// valor inventado (regra 10 do CLAUDE.md).
const budgetUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
  monthlyLimitCents: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

module.exports = { budgetSchema, budgetUpdateSchema };
