require('./src/config/firebaseAdmin');

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const app = require('./src/app');
const { pollAllUsers } = require('./src/services/whatsappPollingService');

// Chave da IA (Gemini) usada no fallback do parser de mensagens financeiras.
// Configure com: firebase functions:secrets:set GEMINI_API_KEY
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

// Token que autentica o webhook do Evolution. Vai no fim da URL configurada na
// instância: https://.../api/webhooks/evolution/<TOKEN>
// Configure com: firebase functions:secrets:set EVOLUTION_WEBHOOK_TOKEN
const EVOLUTION_WEBHOOK_TOKEN = defineSecret('EVOLUTION_WEBHOOK_TOKEN');

// API principal — todas as rotas sob /api (o webhook usa a IA no fallback)
exports.api = onRequest(
  {
    region: 'southamerica-east1',
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: [GEMINI_API_KEY, EVOLUTION_WEBHOOK_TOKEN],
  },
  app
);

// Polling automático a cada 2 minutos
exports.pollWhatsapp = onSchedule(
  { schedule: 'every 2 minutes', region: 'southamerica-east1', timeoutSeconds: 120, memory: '256MiB', secrets: [GEMINI_API_KEY] },
  async () => {
    console.log('[Polling] Iniciando verificação automática...');
    const results = await pollAllUsers();
    console.log('[Polling] Concluído:', JSON.stringify(results));
  }
);
