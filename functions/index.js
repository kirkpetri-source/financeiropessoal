require('./src/config/firebaseAdmin');

const { onRequest } = require('firebase-functions/v2/https');
const app = require('./src/app');

exports.api = onRequest(
  { region: 'southamerica-east1', timeoutSeconds: 60, memory: '256MiB' },
  app
);
