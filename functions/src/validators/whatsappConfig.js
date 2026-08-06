const { z } = require('zod');

/**
 * O que o CLIENTE pode editar na configuração do canal. Só isso.
 *
 * Antes o schema aceitava evolutionApiUrl, instanceName, apiKey, groupId,
 * enabled e allowPrivateChat — e `enabled` e `allowPrivateChat` tinham
 * `.default(false)`. Isso destruiu uma conta em produção:
 *
 *   20:05:32  grupo criado e gravado
 *   20:06:05  cliente salva a mensagem de confirmação
 *             -> o formulário mandava groupId e apiKey vazios
 *             -> o zod preenchia enabled: false por causa do default
 *             -> canal desligado, grupo perdido, mensagens descartadas
 *
 * O cliente não configura infraestrutura: instância, credencial, grupo e o
 * liga/desliga do canal são decididos pelo assistente de conexão e pelo modo
 * de uso. Nada disso entra por aqui, nem com valor padrão.
 */
const whatsappConfigSchema = z.object({
  confirmationMessageTemplate: z.string().max(500).optional().nullable(),
}).strict('Esse campo não é editável por aqui.');

module.exports = { whatsappConfigSchema };
