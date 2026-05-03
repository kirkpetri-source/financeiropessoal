const { z } = require('zod');

const payerSchema = z.object({
  name: z.string().min(1).max(50),
  phone: z.string().max(20).optional().nullable(),
});

const whatsappConfigSchema = z.object({
  enabled: z.boolean().default(false),
  evolutionApiUrl: z.string().url('URL inválida.').optional().nullable().or(z.literal('')),
  instanceName: z.string().max(100).optional().nullable(),
  apiKey: z.string().max(500).optional().nullable(),
  groupId: z.string().max(100).optional().nullable(),
  confirmationMessageTemplate: z.string().max(500).optional().nullable(),
  allowPrivateChat: z.boolean().default(false),
  payers: z.array(payerSchema).optional().nullable(),
});

module.exports = { whatsappConfigSchema };
