#!/usr/bin/env node
/**
 * Diagnóstico da assinatura — SOMENTE LEITURA.
 *
 *   node tools/diagnostico-assinatura.js
 *
 * Responde a pergunta que precisa ser respondida ANTES do deploy da Fase 5:
 * quais famílias ficam bloqueadas no minuto em que o `exigirAssinatura` entrar
 * no ar? Uma família com `subscription` ausente ou com `trialEndsAt` vazio para
 * de lançar sem aviso — inclusive a do Kirk, que é a família #1.
 *
 * Não escreve nada. Pode rodar quantas vezes quiser.
 */

const { db } = require('../src/config/firebaseAdmin');
const { situacaoDaAssinatura, mensagemDaSituacao } = require('../src/assinatura/estado');
const { resumirFamilias } = require('../src/assinatura/metricas');

function data(valor) {
  const d = valor?.toDate?.() || (valor ? new Date(valor) : null);
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '—';
}

async function main() {
  const agora = new Date();
  const snap = await db.collection('households').get();
  const familias = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (!familias.length) {
    console.log('Nenhuma família encontrada.');
    process.exit(0);
  }

  console.log(`Diagnóstico de assinatura — ${familias.length} família(s)\n`);

  const bloqueadas = [];

  for (const familia of familias) {
    const s = familia.subscription;
    const situacao = situacaoDaAssinatura(s, agora);

    console.log(`${familia.name || '(sem nome)'}  [${familia.id}]`);
    console.log(`  status          ${s?.status || 'AUSENTE'}`);
    console.log(`  trial até       ${data(s?.trialEndsAt)}`);
    console.log(`  período até     ${data(s?.currentPeriodEnd)}`);
    console.log(`  provedor        ${s?.provider || '—'}${s?.externalId ? ` (${s.externalId})` : ''}`);
    console.log(`  pode lançar     ${situacao.podeLancar ? 'SIM' : 'NÃO'}  (${situacao.motivo})`);
    console.log(`  mensagem        ${mensagemDaSituacao(situacao)}`);

    // Contagem de lançamentos: mostra o tamanho do que estaria em risco de
    // congelar. É count(), não leitura dos documentos.
    const total = await db.collection('transactions')
      .where('householdId', '==', familia.id).count().get();
    console.log(`  lançamentos     ${total.data().count}`);

    if (familia.deletion) {
      console.log(`  EXCLUSÃO agendada para ${data(familia.deletion.scheduledFor)}`);
    }

    console.log('');

    if (!situacao.podeLancar) bloqueadas.push(familia);
  }

  const resumo = resumirFamilias(familias, agora);
  console.log('Resumo');
  console.log(`  MRR                 R$ ${resumo.mrr.toFixed(2)}`);
  console.log(`  pagantes            ${resumo.pagantes}`);
  console.log(`  em trial            ${resumo.emTrial}`);
  console.log(`  ativas hoje         ${resumo.ativas} de ${resumo.total}`);
  console.log(`  seriam bloqueadas   ${bloqueadas.length}`);

  if (bloqueadas.length) {
    console.log('\nATENÇÃO: estas famílias param de lançar assim que a Fase 5 subir:');
    for (const f of bloqueadas) console.log(`  - ${f.name || f.id} (${f.id})`);
    console.log('\nResolva antes do deploy (ex.: tools/marcar-conta-interna.js).');
  } else {
    console.log('\nNenhuma família seria bloqueada pelo deploy.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\nFalha no diagnóstico:', err.message);
  process.exit(1);
});
