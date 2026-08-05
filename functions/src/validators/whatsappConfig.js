const { z } = require('zod');

const payerSchema = z.object({
  name: z.string().min(1).max(50),
  phone: z.string().max(20).optional().nullable(),
});

const whatsappConfigSchema = z.object({
  enabled: z.boolean().default(false),
  // Endereço do SERVIDOR Evolution (ex.: https://evolution.seudominio.com).
  // Recusa a URL do nosso próprio webhook: são dois campos parecidos na tela e
  // colar um no lugar do outro derruba o polling inteiro com erro 404.
  evolutionApiUrl: z.string()
    .url('URL inválida.')
    .refine((v) => !/\/webhooks?\//i.test(v), {
      message: 'Esse é o endereço do webhook, não o do servidor Evolution. Use algo como https://evolution.seudominio.com',
    })
    .refine((v) => !/cloudfunctions\.net|run\.app/i.test(v), {
      message: 'Esse é o endereço da própria API do sistema. Informe o endereço do seu servidor Evolution.',
    })
    .optional().nullable().or(z.literal('')),
  instanceName: z.string().max(100).optional().nullable(),
  apiKey: z.string().max(500).optional().nullable(),
  groupId: z.string().max(100).optional().nullable(),
  confirmationMessageTemplate: z.string().max(500).optional().nullable(),
  allowPrivateChat: z.boolean().default(false),
  payers: z.array(payerSchema).optional().nullable(),
});

module.exports = { whatsappConfigSchema };
