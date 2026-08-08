const { z } = require('zod');

const paymentMethodSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório.').max(100),
  isCreditCard: z.boolean().optional(),
  // Só fazem sentido quando isCreditCard é true; a validação de par completo
  // fica no service, não aqui — cartão criado sem os dois dias ainda pode
  // ganhar depois, editando.
  closingDay: z.number().int().min(1).max(31).optional().nullable(),
  dueDay: z.number().int().min(1).max(31).optional().nullable(),
});

const paymentMethodUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  closingDay: z.number().int().min(1).max(31).optional().nullable(),
  dueDay: z.number().int().min(1).max(31).optional().nullable(),
});

module.exports = { paymentMethodSchema, paymentMethodUpdateSchema };
