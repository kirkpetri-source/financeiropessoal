const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const categoryRoutes = require('./routes/categories');
const paymentMethodRoutes = require('./routes/paymentMethods');
const whatsappRoutes = require('./routes/whatsapp');
const householdRoutes = require('./routes/households');
const assinaturaRoutes = require('./routes/assinatura');
const lgpdRoutes = require('./routes/lgpd');
const adminRoutes = require('./routes/admin');
const budgetRoutes = require('./routes/budgets');
const recurringBillRoutes = require('./routes/recurringBills');
const creditCardInvoiceRoutes = require('./routes/creditCardInvoices');
const { handleEvolutionWebhook } = require('./webhooks/evolutionWebhook');
const { handleMercadoPagoWebhook, handleMercadoPagoPing } = require('./webhooks/mercadoPagoWebhook');
const errorHandler = require('./middlewares/errorHandler');
const { webhookAuth } = require('./middlewares/webhookAuth');
const { limiteWebhook, limiteAuth, limitePolling, limiteGeral } = require('./middlewares/rateLimit');

const app = express();

// Cloud Functions fica atrás de proxy — sem isso o rate limit enxerga um IP só
// para todo mundo. O 1 restringe a confiança ao primeiro proxy da cadeia.
app.set('trust proxy', 1);

// Origens permitidas. ALLOWED_ORIGINS sobrescreve para outros ambientes:
// ALLOWED_ORIGINS="https://app.exemplo.com,https://outro.com".
// Sem a env definida, cai na lista fixa dos domínios de produção — nunca em
// "*": mesmo a API sendo autenticada por Bearer token e não por cookie,
// liberar qualquer origem facilita abuso da API por um site de terceiro caso
// um token vaze por outro caminho (ex.: XSS numa extensão de navegador).
// revelacash.com.br é o domínio custom em uso pelos clientes reais desde
// 08/08/2026 (DNS -> Vercel); o .vercel.app continua valendo como alias.
const ORIGENS_PRODUCAO = [
  'https://revelacash.com.br',
  'https://www.revelacash.com.br',
  'https://financeiropessoal-tau.vercel.app',
];
const ORIGENS_DEV = ['http://localhost:5173', 'http://127.0.0.1:5173'];

const origensPermitidas = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : process.env.NODE_ENV === 'production'
    ? ORIGENS_PRODUCAO
    : [...ORIGENS_PRODUCAO, ...ORIGENS_DEV];

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

// Webhook do Mercado Pago. Não leva token na URL como o do Evolution porque
// aqui existe assinatura HMAC de verdade no cabeçalho — o handler confere antes
// de encostar em qualquer coisa.
app.post('/webhooks/mercadopago', limiteWebhook, handleMercadoPagoWebhook);

// GET/HEAD: só a checagem de alcance que o painel do Mercado Pago faz antes de
// aceitar a URL. Express responde HEAD sozinho a partir do GET.
app.get('/webhooks/mercadopago', limiteWebhook, handleMercadoPagoPing);

app.use(limiteGeral);

app.use('/auth', limiteAuth, authRoutes);
app.use('/transactions', transactionRoutes);
app.use('/categories', categoryRoutes);
app.use('/payment-methods', paymentMethodRoutes);
app.use('/households', householdRoutes);
app.use('/subscription', assinaturaRoutes);
app.use('/lgpd', lgpdRoutes);
app.use('/budgets', budgetRoutes);
app.use('/recurring-bills', recurringBillRoutes);
app.use('/faturas', creditCardInvoiceRoutes);
// Painel do operador — login próprio (usuário/senha, ver
// tools/criar-login-operador.js), separado da conta pessoal de qualquer
// família. A proteção de verdade continua sendo o middleware apenasAdmin
// (ADMIN_EMAILS/custom claim), não o nome da rota.
app.use('/plataforma', adminRoutes);
app.use('/whatsapp/poll', limitePolling);
app.use('/whatsapp', whatsappRoutes);

app.use(errorHandler);

module.exports = app;
