const { z } = require('zod');
const { CATEGORIAS, LIMITES } = require('../chamados/estado');

/**
 * Sem `.default()` em nada (regra 10 do projeto): o zod preencheria o campo
 * mesmo quando o corpo não o menciona, e o valor inventado sobrescreveria o
 * real.
 *
 * `.strict()` em tudo: um corpo com `householdId`, `status` ou `numero` dentro
 * é recusado em voz alta em vez de ser ignorado em silêncio. O service nunca
 * leria esses campos do corpo de qualquer jeito — mas a diferença entre "foi
 * ignorado" e "foi recusado" é a diferença entre descobrir uma tentativa e não
 * descobrir.
 *
 * `anexos` NÃO entra aqui ainda, de propósito. Aceitar um `storagePath` vindo
 * do corpo antes de o upload existir seria aceitar que o cliente aponte para o
 * arquivo de outra família. O campo entra junto com a rota de upload, que é
 * quem sabe validar de quem é o caminho.
 */

const textoDaMensagem = z.string({ required_error: 'Escreva sua mensagem.' })
  .trim()
  .min(1, 'Escreva sua mensagem.')
  .max(
    LIMITES.CARACTERES_POR_MENSAGEM,
    `Mensagem muito longa (limite de ${LIMITES.CARACTERES_POR_MENSAGEM} caracteres).`,
  );

const aberturaSchema = z.object({
  assunto: z.string({ required_error: 'Escreva o assunto do chamado.' })
    .trim()
    .min(1, 'Escreva o assunto do chamado.')
    .max(LIMITES.ASSUNTO_MAXIMO, `O assunto cabe em ${LIMITES.ASSUNTO_MAXIMO} caracteres.`),

  categoria: z.enum(Object.values(CATEGORIAS), {
    errorMap: () => ({ message: 'Escolha uma categoria válida para o chamado.' }),
  }),

  texto: textoDaMensagem,
}).strict();

const respostaSchema = z.object({
  texto: textoDaMensagem,
}).strict();

module.exports = { aberturaSchema, respostaSchema };
