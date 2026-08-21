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
 * `anexos` é uma lista de CAMINHOS, e só. Nome, tipo e tamanho não vêm do
 * corpo: o backend relê tudo do próprio objeto no Storage. Aceitar o metadado
 * do cliente deixaria ele escrever "extrato.pdf, 2 KB" numa coisa que é outra.
 * E o caminho passa por `anexoService.metadadosDe`, que exige que ele esteja
 * dentro da pasta desta família E que o arquivo exista.
 */

const textoDaMensagem = z.string({ required_error: 'Escreva sua mensagem.' })
  .trim()
  .min(1, 'Escreva sua mensagem.')
  .max(
    LIMITES.CARACTERES_POR_MENSAGEM,
    `Mensagem muito longa (limite de ${LIMITES.CARACTERES_POR_MENSAGEM} caracteres).`,
  );

const caminhosDeAnexo = z.array(z.string().trim().min(1))
  .max(LIMITES.ANEXOS_POR_MENSAGEM, `No máximo ${LIMITES.ANEXOS_POR_MENSAGEM} anexos por mensagem.`)
  .optional();

const aberturaSchema = z.object({
  assunto: z.string({ required_error: 'Escreva o assunto do chamado.' })
    .trim()
    .min(1, 'Escreva o assunto do chamado.')
    .max(LIMITES.ASSUNTO_MAXIMO, `O assunto cabe em ${LIMITES.ASSUNTO_MAXIMO} caracteres.`),

  categoria: z.enum(Object.values(CATEGORIAS), {
    errorMap: () => ({ message: 'Escolha uma categoria válida para o chamado.' }),
  }),

  texto: textoDaMensagem,
  anexos: caminhosDeAnexo,
}).strict();

const respostaSchema = z.object({
  texto: textoDaMensagem,
  anexos: caminhosDeAnexo,
}).strict();

/**
 * Upload. `conteudo` é base64 — multipart exigiria `multer`, dependência nova
 * numa function que hoje tem oito, e o volume aqui não paga isso. 5 MB
 * binários viram ~6,7 MB em base64, e a rota tem limite próprio de 8 MB
 * montado antes do parser global (mesmo padrão de `/importacao`).
 *
 * O tamanho de verdade é conferido no service, sobre o buffer JÁ decodificado:
 * validar o comprimento da string base64 aqui erraria em 33%.
 */
const uploadSchema = z.object({
  arquivos: z.array(z.object({
    nomeOriginal: z.string().trim().min(1, 'Arquivo sem nome.'),
    conteudo: z.string().min(1, 'Arquivo vazio.'),
  }).strict())
    .min(1, 'Nenhum arquivo enviado.')
    .max(LIMITES.ANEXOS_POR_MENSAGEM, `No máximo ${LIMITES.ANEXOS_POR_MENSAGEM} anexos por vez.`),
}).strict();

module.exports = { aberturaSchema, respostaSchema, uploadSchema };
