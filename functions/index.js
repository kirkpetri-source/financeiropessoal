require('./src/config/firebaseAdmin');

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const app = require('./src/app');
const { pollAllUsers } = require('./src/services/whatsappPollingService');

// API principal — todas as rotas sob /api
exports.api = onRequest(
  { region: 'southamerica-east1', timeoutSeconds: 60, memory: '256MiB' },
  app
);

// Polling automático a cada 2 minutos
exports.pollWhatsapp = onSchedule(
  { schedule: 'every 2 minutes', region: 'southamerica-east1', timeoutSeconds: 120, memory: '256MiB' },
  async () => {
    console.log('[Polling] Iniciando verificação automática...');
    const results = await pollAllUsers();
    console.log('[Polling] Concluído:', JSON.stringify(results));
  }
);
