const { z } = require('zod');

const categorySchema = z.object({
  name: z.string().min(1, 'Nome obrigatório.').max(100),
  type: z.enum(['INCOME', 'EXPENSE', 'BOTH'], { required_error: 'Tipo obrigatório.' }),
  color: z.string().optional().nullable(),
});

module.exports = { categorySchema };
