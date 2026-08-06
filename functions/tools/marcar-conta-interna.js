#!/usr/bin/env node
/**
 * Marca uma família como conta interna (cortesia vitalícia).
 *
 *   node tools/marcar-conta-interna.js <householdId>              # simulação
 *   node tools/marcar-conta-interna.js <householdId> --confirmar  # aplica
 *   node tools/marcar-conta-interna.js <householdId> --reverter --confirmar
 *
 * Existe por um motivo concreto: a família do Kirk é a #1 e o primeiro teste de
 * tudo. Quando o trial dela vencer, o `exigirAssinatura` bloqueia o lançamento
 * dele igual bloquearia o de qualquer cliente — e aí o dono do produto fica
 * sem usar o produto.
 *
 * A conta interna fica com `subscription.plan = 'interno'`, status `active` e
 * `priceCents: 0`. As métricas contam ela em "ativas" e em "internas", nunca em
 * pagantes, MRR, churn ou conversão (ver src/assinatura/metricas.js).
 *
 * Escreve no Firestore, então exige backup recente. Sem `--confirmar`, só
 * mostra o que faria.
 */

const fs = require('fs');
const path = require('path');
const { admin, db } = require('../src/config/firebaseAdmin');
const { situacaoDaAssinatura } = require('../src/assinatura/estado');
const { PLANO_INTERNO } = require('../src/assinatura/metricas');

const HORAS_DE_VALIDADE_DO_BACKUP = 24;

/** Backup antes de escrever é regra do projeto, não sugestão. */
function conferirBackupRecente() {
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

async function main() {
  const [, , householdId, ...flags] = process.argv;
  const confirmar = flags.includes('--confirmar');
  const reverter = flags.includes('--reverter');

  if (!householdId) {
    console.error('Uso: node tools/marcar-conta-interna.js <householdId> [--reverter] [--confirmar]');
    console.error('Descubra o id com: node tools/diagnostico-assinatura.js');
    process.exit(1);
  }

  const ref = db.collection('households').doc(householdId);
  const doc = await ref.get();

  if (!doc.exists) {
    console.error(`Família ${householdId} não existe.`);
    process.exit(1);
  }

  const familia = doc.data();
  const antes = familia.subscription || {};
  const situacaoAntes = situacaoDaAssinatura(antes, new Date());

  console.log(`Família: ${familia.name || '(sem nome)'}  [${householdId}]`);
  console.log(`  antes:  plan=${antes.plan || '—'} status=${antes.status || '—'} podeLancar=${situacaoAntes.podeLancar}`);

  const depois = reverter
    ? { status: 'trialing', plan: 'familia', priceCents: null }
    : { status: 'active', plan: PLANO_INTERNO, priceCents: 0 };

  console.log(`  depois: plan=${depois.plan} status=${depois.status} podeLancar=${!reverter}`);

  if (reverter && !antes.trialEndsAt) {
    console.log('\nAviso: ao reverter, esta família volta para trial SEM data de fim,');
    console.log('o que a bloqueia imediatamente. Defina trialEndsAt antes.');
  }

  if (!confirmar) {
    console.log('\nSIMULAÇÃO — nada foi gravado. Rode de novo com --confirmar para aplicar.');
    process.exit(0);
  }

  const backup = conferirBackupRecente();
  if (!backup) {
    console.error(`\nSem backup nas últimas ${HORAS_DE_VALIDADE_DO_BACKUP}h. Rode "npm run backup" antes.`);
    process.exit(1);
  }
  console.log(`\nBackup encontrado: ${backup.nome} (${backup.idadeHoras.toFixed(1)}h atrás)`);

  await ref.update({
    'subscription.status': depois.status,
    'subscription.plan': depois.plan,
    'subscription.priceCents': depois.priceCents,
    // Registro de por que esta família não paga, para ninguém achar daqui a um
    // ano que foi bug de cobrança.
    'subscription.internalNote': reverter
      ? admin.firestore.FieldValue.delete()
      : 'Conta interna (cortesia). Fora do MRR por decisão, não por falha de cobrança.',
    'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(reverter ? 'OK — cortesia removida.' : 'OK — família marcada como conta interna.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFalha:', err.message);
  process.exit(1);
});
