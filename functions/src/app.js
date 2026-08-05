const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const categoryRoutes = require('./routes/categories');
const paymentMethodRoutes = require('./routes/paymentMethods');
const whatsappRoutes = require('./routes/whatsapp');
const householdRoutes = require('./routes/households');
const { handleEvolutionWebhook } = require('./webhooks/evolutionWebhook');
const errorHandler = require('./middlewares/errorHandler');
const { webhookAuth } = require('./middlewares/webhookAuth');
const { limiteWebhook, limiteAuth, limitePolling, limiteGeral } = require('./middlewares/rateLimit');

const app = express();

// Cloud Functions fica atrás de proxy — sem isso o rate limit enxerga um IP só
// para todo mundo. O 1 restringe a confiança ao primeiro proxy da cadeia.
app.set('trust proxy', 1);

// Origens permitidas. A autenticação é por Bearer token (não por cookie), então
// liberar geral não expõe sessão de ninguém; ainda assim dá para restringir
// definindo ALLOWED_ORIGINS="https://app.exemplo.com,https://outro.com".
const origensPermitidas = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : '*';

app.use(cors({
  origin: origensPermitidas,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());

// O payload do Evolution carrega metadados da mensagem, não mídia — 1mb sobra.
app.use(express.json({ limit: '1mb' }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Webhook autenticado por token no caminho. Fica antes do limite geral porque
// tem limite próprio, mais alto (uma requisição por mensagem recebida).
app.post('/webhooks/evolution/:token', limiteWebhook, webhookAuth, handleEvolutionWebhook);

// Caminho antigo, sem token. Recusa e deixa registro no log — assim uma
// instância do Evolution ainda apontando para cá aparece no diagnóstico em vez
// de falhar em silêncio.
app.post('/webhooks/evolution', limiteWebhook, (req, res) => {
  console.warn('[Webhook] Chamada sem token no caminho antigo. Atualize a URL na Evolution API.');
  res.status(401).json({ error: 'Webhook exige token na URL. Atualize a configuração na Evolution API.' });
});

app.use(limiteGeral);

app.use('/auth', limiteAuth, authRoutes);
app.use('/transactions', transactionRoutes);
app.use('/categories', categoryRoutes);
app.use('/payment-methods', paymentMethodRoutes);
app.use('/households', householdRoutes);
app.use('/whatsapp/poll', limitePolling);
app.use('/whatsapp', whatsappRoutes);

app.use(errorHandler);

module.exports = app;
