const { z } = require('zod');

const subcategorySchema = z.object({
  name: z.string().min(1, 'Nome obrigatório.').max(100),
  categoryId: z.string().min(1, 'Categoria obrigatória.'),
});

module.exports = { subcategorySchema };
