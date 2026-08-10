const { z } = require('zod');

// Chamado só depois que o Firebase Auth já criou a conta no frontend — este
// endpoint apenas salva o perfil no Firestore, por isso não recebe senha.
const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres.').max(100),
  email: z.string().email('E-mail inválido.'),
  telefone: z.string().max(20).optional(),
  aceitouTermos: z.boolean().optional(),
});

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres.').max(100).optional(),
  email: z.string().email('E-mail inválido.').optional(),
});

module.exports = { registerSchema, updateProfileSchema };
