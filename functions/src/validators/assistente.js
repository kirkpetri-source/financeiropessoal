const { z } = require('zod');

/**
 * Teto da pergunta. Uma pessoa não escreve 2000 caracteres perguntando sobre o
 * próprio mercado; o limite existe para um texto colado por engano (ou de
 * propósito) morrer na porta em vez de virar prompt gigante pago por nós.
 */
const MAX_PERGUNTA = 1000;

/**
 * Sem `.default()` em nada (regra 10 do projeto): o zod preencheria o campo
 * mesmo quando o corpo não o menciona, e o valor inventado sobrescreveria o
 * real.
 *
 * `interlocutor`, `householdId` e as permissões NÃO entram aqui de propósito —
 * quem manda nisso é a sessão autenticada, nunca o corpo da requisição.
 */
const perguntarSchema = z.object({
  pergunta: z.string({ required_error: 'Escreva sua pergunta.' })
    .trim()
    .min(1, 'Escreva sua pergunta.')
    .max(MAX_PERGUNTA, 'Pergunta muito longa. Tente resumir.'),
});

module.exports = { perguntarSchema, MAX_PERGUNTA };
