const { z } = require('zod');

const transactionSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE'], { required_error: 'Tipo obrigatório.' }),
  description: z.string().min(1, 'Descrição obrigatória.').max(255),
  amount: z.number({ required_error: 'Valor obrigatório.' }).positive('Valor deve ser positivo.'),
  categoryId: z.string().min(1, 'Categoria obrigatória.'),
  paymentMethodId: z.string().min(1, 'Forma de pagamento obrigatória.'),
  date: z.string().min(1, 'Data obrigatória.'),
  notes: z.string().max(500).optional().nullable(),
  origin: z.enum(['MANUAL', 'WHATSAPP', 'AI', 'AUDIO', 'IMAGE']).default('MANUAL'),
  status: z.enum(['CONFIRMED', 'PENDING', 'ERROR']).default('CONFIRMED'),
});

const transactionUpdateSchema = transactionSchema.partial();

module.exports = { transactionSchema, transactionUpdateSchema };
