#!/usr/bin/env node
/**
 * Apaga uma família inteira — dados, membros, canal e contas de login.
 *
 *   node tools/apagar-familia.js <householdId>              # simulação
 *   node tools/apagar-familia.js <householdId> --confirmar  # apaga de verdade
 *
 * Diferente do fluxo de LGPD (`executarExclusoes`, com 7 dias de arrependimento),
 * este é o caminho do OPERADOR para limpar conta de teste. Não espera prazo.
 *
 * Por isso, três travas:
 *   - simulação por padrão;
 *   - exige backup das últimas 24h;
 *   - recusa família com lançamentos, a menos que venha --mesmo-com-dados.
 *
 * O que apaga: lançamentos, logs, categorias e formas de pagamento da família,
 * config do canal, a instância no servidor Evolution, os membros, o documento
 * da família e as contas do Firebase Auth de quem só participava dela.
 */

const { carregar } = require('./carregarAmbiente');
carregar(['EVOLUTION_API_KEY']);

const fs = require('fs');
const path = require('path');
const { admin, db } = require('../src/config/firebaseAdmin');
const lgpdService = require('../src/services/lgpdService');
const provider = require('../src/canais/evolutionProvider');
const { servidor, servidorConfigurado, nomeDaInstancia } = require('../src/config/evolutionServidor');

const HORAS_DE_VALIDADE_DO_BACKUP = 24;

function backupRecente() {
  const pasta = path.join(__dirname, '..', '..', 'backups');
  if (!fs.existsSync(pasta)) return null;

  const arquivos = fs.readdirSync(pasta)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ nome: f, mtime: fs.statSync(path.join(pasta, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (!arquivos.length) return null;

  const idadeHoras = (Date.now() - arquivos[0].mtime) / 3600000;
  return idadeHoras <= HORAS_DE_VALIDADE_DO_BACKUP ? { ...arquivos[0], idadeHoras } : null;
}

function linha(rotulo, valor) {
  console.log(`  ${String(rotulo).padEnd(24)}${valor}`);
}

async function main() {
  const [, , householdId, ...flags] = process.argv;
  const confirmar = flags.includes('--confirmar');
  const mesmoComDados = flags.includes('--mesmo-com-dados');

  if (!householdId) {
    console.error('Uso: node tools/apagar-familia.js <householdId> [--confirmar] [--mesmo-com-dados]');
    console.error('Liste os ids com: node tools/diagnostico-assinatura.js');
    process.exit(1);
  }

  const doc = await db.collection('households').doc(householdId).get();
  if (!doc.exists) {
    console.error(`Família ${householdId} não existe.`);
    process.exit(1);
  }

  const familia = doc.data();
  const membros = await db.collection('households').doc(householdId).collection('members').get();
  const transacoes = await db.collection('transactions').where('householdId', '==', householdId).count().get();
  const logs = await db.collection('whatsappLogs').where('householdId', '==', householdId).count().get();
  const canal = await db.collection('whatsappConfigs').doc(householdId).get();

  console.log('Família a apagar');
  linha('nome', familia.name || '(sem nome)');
  linha('id', householdId);
  linha('dono', familia.ownerId);
  linha('membros', membros.size);
  linha('lançamentos', transacoes.data().count);
  linha('mensagens', logs.data().count);
  linha('instância', canal.exists ? (canal.data().instanceName || '—') : '—');
  linha('grupo', canal.exists ? (canal.data().groupId || '—') : '—');

  const quantidade = transacoes.data().count;
  if (quantidade > 0 && !mesmoComDados) {
    console.error(`\nRECUSADO: esta família tem ${quantidade} lançamento(s).`);
    console.error('Se é isso mesmo, repita com --mesmo-com-dados.');
    process.exit(1);
  }

  // Contas de login: só quem NÃO participa de outra família perde o acesso.
  const logins = [];
  for (const m of membros.docs) {
    const id = m.id;
    if (id.startsWith('wa-') || id.startsWith('pendente-')) continue; // membro sem login
    logins.push(id);
  }
  linha('contas de login', logins.length ? logins.join(', ') : 'nenhuma');

  if (!confirmar) {
    console.log('\nSIMULAÇÃO — nada foi apagado. Repita com --confirmar.');
    process.exit(0);
  }

  const backup = backupRecente();
  if (!backup) {
    console.error(`\nSem backup nas últimas ${HORAS_DE_VALIDADE_DO_BACKUP}h. Rode "npm run backup" antes.`);
    process.exit(1);
  }
  console.log(`\nBackup: ${backup.nome} (${backup.idadeHoras.toFixed(1)}h atrás)`);

  // 1. Instância no servidor Evolution — antes do Firestore, porque depois o
  //    nome dela deixa de estar registrado em algum lugar.
  const instanceName = canal.exists ? canal.data().instanceName : nomeDaInstancia(householdId);
  if (instanceName && servidorConfigurado()) {
    const { url, apiKey } = servidor();
    const config = { evolutionApiUrl: url, apiKey };
    try {
      await provider.desconectarInstancia(config, instanceName);
      await provider.apagarInstancia(config, instanceName);
      console.log(`  instância ${instanceName} apagada do servidor`);
    } catch (err) {
      console.warn(`  aviso: não apagou a instância (${err.message})`);
    }
  }

  // 2. Dados da família. Reaproveita o caminho de LGPD, que já é o que roda
  //    quando um cliente pede exclusão — nada de segunda implementação.
  const contagem = await lgpdService.apagarHousehold(householdId);
  console.log(`  dados apagados: ${JSON.stringify(contagem)}`);

  // 3. Contas de login e o documento em users/.
  for (const uid of logins) {
    try {
      await admin.auth().deleteUser(uid);
      console.log(`  login ${uid} removido do Firebase Auth`);
    } catch (err) {
      console.warn(`  aviso: não removeu o login ${uid} (${err.message})`);
    }
    try {
      await db.collection('users').doc(uid).delete();
    } catch { /* já foi */ }
  }

  console.log('\nOK — família apagada.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFalha:', err.message);
  process.exit(1);
});
