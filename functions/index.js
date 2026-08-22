require('./src/config/firebaseAdmin');

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const app = require('./src/app');
const { pollAllHouseholds } = require('./src/services/whatsappPollingService');
const { executarExclusoesPendentes } = require('./src/services/lgpdService');
const { resolverInativos } = require('./src/services/chamadosPlataformaService');
const { gerarLancamentosDoDia } = require('./src/services/recurringBillService');
const { fecharFaturasDoDia } = require('./src/services/invoiceService');
const { exportarAgora } = require('./src/services/backupService');
const { vigiar } = require('./src/services/alertaOperacionalService');

// Chave da IA (Gemini) usada no fallback do parser de mensagens financeiras.
// Configure com: firebase functions:secrets:set GEMINI_API_KEY
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

// Token que autentica o webhook do Evolution. Vai no fim da URL configurada na
// instância: https://.../api/webhooks/evolution/<TOKEN>
// Configure com: firebase functions:secrets:set EVOLUTION_WEBHOOK_TOKEN
const EVOLUTION_WEBHOOK_TOKEN = defineSecret('EVOLUTION_WEBHOOK_TOKEN');

// Cobrança (Mercado Pago). O access token assina as chamadas à API; o webhook
// secret confere o HMAC das notificações recebidas — sem ele o webhook recusa
// tudo, de propósito.
// firebase functions:secrets:set MERCADOPAGO_ACCESS_TOKEN
// firebase functions:secrets:set MERCADOPAGO_WEBHOOK_SECRET
const MERCADOPAGO_ACCESS_TOKEN = defineSecret('MERCADOPAGO_ACCESS_TOKEN');
const MERCADOPAGO_WEBHOOK_SECRET = defineSecret('MERCADOPAGO_WEBHOOK_SECRET');

// Chave global do servidor Evolution do operador. É com ela que o sistema cria
// a instância de cada família — o cliente nunca vê nem informa credencial.
// firebase functions:secrets:set EVOLUTION_API_KEY
const EVOLUTION_API_KEY = defineSecret('EVOLUTION_API_KEY');

const SEGREDOS = [
  GEMINI_API_KEY,
  EVOLUTION_WEBHOOK_TOKEN,
  MERCADOPAGO_ACCESS_TOKEN,
  MERCADOPAGO_WEBHOOK_SECRET,
  EVOLUTION_API_KEY,
];

// API principal — todas as rotas sob /api (o webhook usa a IA no fallback)
exports.api = onRequest(
  {
    region: 'southamerica-east1',
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: SEGREDOS,
  },
  app
);

// Polling automático a cada 2 minutos
exports.pollWhatsapp = onSchedule(
  { schedule: 'every 2 minutes', region: 'southamerica-east1', timeoutSeconds: 120, memory: '256MiB', secrets: [GEMINI_API_KEY, EVOLUTION_API_KEY] },
  async () => {
    console.log('[Polling] Iniciando verificação automática...');
    const results = await pollAllHouseholds();
    console.log('[Polling] Concluído:', JSON.stringify(results));
  }
);

// Exclusão de conta (LGPD). O pedido só marca a data; quem apaga de verdade é
// isto, depois do prazo de arrependimento. Roda uma vez por dia — exclusão não
// precisa ser instantânea, e um job diário deixa muito mais margem para
// perceber um erro antes de ele virar perda irreversível.
// A partir de 21/08/2026 ela também encerra chamado de suporte parado.
//
// O NOME EXPORTADO NÃO PODE MUDAR. O Cloud Scheduler identifica o job pelo
// nome: renomear cria um agendamento NOVO e deixa o antigo vivo, rodando a
// versão velha do código. Dois jobs apagando família é o pior resultado
// possível aqui. Há um teste estático guardando isto (`__testes__/agendadas`).
//
// Duas tarefas independentes, cada uma com o seu try/catch: uma falhando não
// pode impedir a outra. Antes o corpo da LGPD estava inline aqui e sem
// try/catch por família — uma que falhasse derrubava as seguintes.
exports.executarExclusoes = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'America/Sao_Paulo', region: 'southamerica-east1', timeoutSeconds: 540, memory: '256MiB' },
  async () => {
    // `vigiar` engole o erro e registra um aviso que aparece no topo da aba
    // Chamados do /plataforma — antes isso era só um console.error que
    // ninguém veria. As duas rodam independentes: uma falhar não cancela a
    // outra.
    await vigiar('LGPD', () => executarExclusoesPendentes(new Date()));
    await vigiar('Chamados', () => resolverInativos(new Date()));
  }
);

// Contas fixas recorrentes: gera o lançamento do mês de quem vence hoje, em
// todas as famílias. Roda de madrugada para o lançamento já aparecer pronto
// quando a família abrir o painel.
exports.gerarContasRecorrentes = onSchedule(
  { schedule: 'every day 04:00', timeZone: 'America/Sao_Paulo', region: 'southamerica-east1', timeoutSeconds: 300, memory: '256MiB' },
  async () => {
    await vigiar('ContasRecorrentes', () => gerarLancamentosDoDia(new Date()));
  }
);

// Fatura de cartão de crédito: fecha o ciclo de quem chegou no dia do
// fechamento, em todas as famílias.
exports.fecharFaturas = onSchedule(
  { schedule: 'every day 04:30', timeZone: 'America/Sao_Paulo', region: 'southamerica-east1', timeoutSeconds: 300, memory: '256MiB' },
  async () => {
    await vigiar('Faturas', () => fecharFaturasDoDia(new Date()));
  }
);

// Backup automático do Firestore, todo dia de madrugada.
//
// Dispara o export NATIVO do Firestore para o bucket de BACKUP_BUCKET e sai —
// quem faz o trabalho pesado é a infraestrutura do Google, não esta function
// (ver src/services/backupService.js). Às 02:00 de propósito: antes das
// exclusões da LGPD (03:00), então o backup do dia sempre contém o que a
// varredura vai apagar em seguida.
//
// Sem BACKUP_BUCKET no ambiente, o serviço lança e o `vigiar` transforma isso
// num aviso visível — backup desligado precisa doer, não passar batido.
exports.backupDiario = onSchedule(
  { schedule: 'every day 02:00', timeZone: 'America/Sao_Paulo', region: 'southamerica-east1', timeoutSeconds: 120, memory: '256MiB' },
  async () => {
    await vigiar('Backup', () => exportarAgora(new Date()));
  }
);
