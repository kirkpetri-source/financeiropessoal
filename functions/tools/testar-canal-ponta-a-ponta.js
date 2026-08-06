#!/usr/bin/env node
/**
 * Teste do provisionamento do canal WhatsApp, por API.
 *
 *   node tools/testar-canal-ponta-a-ponta.js <householdId>
 *   node tools/testar-canal-ponta-a-ponta.js <householdId> --manter
 *
 * Faz o que o cliente faria na tela, sem navegador:
 *   1. cria a instância no servidor Evolution e aponta o webhook
 *   2. pede o QR Code (só confere que veio; não dá para ler por código)
 *   3. consulta o estado da conexão
 *   4. no fim, apaga a instância de teste (a menos que --manter)
 *
 * O que NÃO dá para automatizar: a leitura do QR, que exige um celular. Daí
 * para frente (criar grupo, cadastrar participantes) só roda com a conexão
 * aberta — use --manter, leia o QR e rode de novo.
 */

const { admin, db } = require('../src/config/firebaseAdmin');
const provider = require('../src/canais/evolutionProvider');
const householdService = require('../src/services/householdService');
const { criarServicoDeInstancia } = require('../src/services/instanciaService');
const { servidor, servidorConfigurado, urlDoWebhook, MAX_MEMBROS } = require('../src/config/evolutionServidor');

function linha(rotulo, valor) {
  console.log(`  ${String(rotulo).padEnd(22)}${valor}`);
}

async function main() {
  const [, , householdId, ...flags] = process.argv;
  const manter = flags.includes('--manter');

  if (!householdId) {
    console.error('Uso: node tools/testar-canal-ponta-a-ponta.js <householdId> [--manter]');
    process.exit(1);
  }

  if (!servidorConfigurado()) {
    console.error('EVOLUTION_SERVER_URL / EVOLUTION_API_KEY não estão no ambiente.');
    process.exit(1);
  }

  const { url, apiKey } = servidor();
  const config = { evolutionApiUrl: url, apiKey };

  console.log('Servidor');
  linha('url', url);
  linha('webhook', urlDoWebhook().replace(/\/[^/]+$/, '/<token>'));
  linha('limite de membros', MAX_MEMBROS);

  const svc = criarServicoDeInstancia({
    db, admin, provider, householdService, webhookUrl: urlDoWebhook(),
  });

  console.log('\n1. Conectando (cria instância + webhook)...');
  const conexao = await svc.conectar(householdId, config);
  linha('instância', conexao.instanceName);
  linha('já existia', conexao.jaExistia ? 'sim' : 'não');
  linha('conectada', conexao.conectada ? 'SIM' : 'não (esperando QR)');
  linha('QR Code', conexao.qrcode ? `recebido (${conexao.qrcode.length} bytes)` : '—');

  console.log('\n2. Consultando o status...');
  const status = await svc.status(householdId, config);
  linha('etapa', status.etapa);
  linha('estado', status.estado);
  linha('tem grupo', status.temGrupo ? 'sim' : 'não');

  const qrOk = conexao.conectada || !!conexao.qrcode;
  console.log(`\n${qrOk ? 'PASSOU' : 'FALHOU'} — provisionamento ${qrOk ? 'funcionando' : 'não devolveu QR nem conexão'}.`);

  if (status.conectada) {
    console.log('\n3. Conexão aberta — criando grupo...');
    const grupo = await svc.criarGrupoDaFamilia(householdId, config, { nomeDaFamilia: 'Teste' });
    linha('grupo', grupo.groupId);
    linha('convite', grupo.linkConvite || '—');

    const membros = await svc.sincronizarMembros(householdId, config);
    linha('participantes', membros.participantes);
    linha('novos membros', membros.novos);
  } else {
    console.log('\n3. Pulado: precisa de um celular lendo o QR.');
    console.log('   Rode com --manter, leia o QR no painel da Evolution e rode de novo.');
  }

  if (!manter) {
    console.log('\n4. Limpando a instância de teste...');
    await svc.desconectar(householdId, config, { apagar: true });
    linha('instância', 'apagada');
  }

  process.exit(qrOk ? 0 : 1);
}

main().catch((err) => {
  console.error('\nFalha:', err.message);
  process.exit(1);
});
