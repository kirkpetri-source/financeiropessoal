const { z } = require('zod');

const recurringBillSchema = z.object({
  description: z.string().min(1, 'Descrição obrigatória.').max(255),
  amountCents: z.number({ required_error: 'Valor obrigatório.' }).int().positive('Valor deve ser positivo.'),
  type: z.enum(['INCOME', 'EXPENSE'], { required_error: 'Tipo obrigatório.' }),
  dueDay: z.number({ required_error: 'Dia de vencimento obrigatório.' }).int().min(1).max(31),
  categoryId: z.string().min(1, 'Categoria obrigatória.'),
  paymentMethodId: z.string().min(1, 'Forma de pagamento obrigatória.'),
  active: z.boolean().optional(),
});

const recurringBillUpdateSchema = z.object({
  description: z.string().min(1).max(255).optional(),
  amountCents: z.number().int().positive().optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  categoryId: z.string().min(1).optional(),
  paymentMethodId: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

module.exports = { recurringBillSchema, recurringBillUpdateSchema };
