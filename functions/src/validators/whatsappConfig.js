const { z } = require('zod');

const whatsappConfigSchema = z.object({
  enabled: z.boolean().default(false),
  evolutionApiUrl: z.string().url('URL inválida.').optional().nullable().or(z.literal('')),
  instanceName: z.string().max(100).optional().nullable(),
  apiKey: z.string().max(500).optional().nullable(),
  groupId: z.string().max(100).optional().nullable(),
  confirmationMessageTemplate: z.string().max(500).optional().nullable(),
  allowPrivateChat: z.boolean().default(false),
  payers: z.array(z.string().max(50)).optional().nullable(),
});

module.exports = { whatsappConfigSchema };
