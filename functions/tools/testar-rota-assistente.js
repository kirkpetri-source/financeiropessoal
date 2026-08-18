/**
 * Exercita a ROTA HTTP da assistente contra a API de homologação, com um
 * usuário autenticado de verdade — token do Firebase Auth, não simulação.
 *
 * O teste anterior (testar-consultor-ponta-a-ponta) chama os serviços direto.
 * Este passa pela porta da frente: middlewares de autenticação, resolução de
 * família, portão de assinatura, validação de corpo e o controller. É o único
 * jeito de provar que o portão de assinante e o filtro de papel funcionam de
 * verdade, e não só nos testes de unidade.
 *
 *   ALVO=staging node tools/testar-rota-assistente.js
 */

const { carregar } = require('./carregarAmbiente');

if (String(process.env.ALVO || '').toLowerCase() !== 'staging') {
  console.error('\n  Este script só roda em homologação. Use:');
  console.error('    ALVO=staging node tools/testar-rota-assistente.js\n');
  process.exit(1);
}

carregar([]);

const { db, admin } = require('../src/config/firebaseAdmin');

const API = 'https://southamerica-east1-revelacash-staging.cloudfunctions.net/api';
const API_KEY = process.env.STAGING_WEB_API_KEY;

const marca = Date.now();
const FAMILIA_PAGANTE = `rota-pagante-${marca}`;
const FAMILIA_TRIAL = `rota-trial-${marca}`;

let passou = 0;
let falhou = 0;

function checar(titulo, condicao, detalhe = '') {
  if (condicao) {
    passou += 1;
    console.log(`  OK   ${titulo}`);
  } else {
    falhou += 1;
    console.log(`  FALHA ${titulo}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

/** Troca um custom token por um ID token, como o navegador faria. */
async function idTokenDe(uid) {
  const custom = await admin.auth().createCustomToken(uid);

  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    },
  );

  const corpo = await resp.json();
  if (!corpo.idToken) throw new Error(`Não consegui o idToken: ${JSON.stringify(corpo).slice(0, 200)}`);
  return corpo.idToken;
}

async function chamar(caminho, { token, metodo = 'GET', corpo } = {}) {
  const resp = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });

  let json = null;
  try { json = await resp.json(); } catch { /* resposta sem corpo */ }
  return { status: resp.status, json };
}

/** Cria família + usuário + membro, com a assinatura pedida. */
async function montarConta(householdId, { pagante, papel = 'owner' }) {
  const uid = `uid-${householdId}`;

  try { await admin.auth().deleteUser(uid); } catch { /* não existia */ }
  await admin.auth().createUser({ uid, email: `${uid}@teste.invalid`, password: 'senha-de-teste-123' });

  const assinatura = pagante
    ? { status: 'active', provider: 'manual', priceCents: 2490, currentPeriodEnd: new Date(Date.now() + 30 * 864e5) }
    : { status: 'trialing', trialEndsAt: new Date(Date.now() + 5 * 864e5) };

  await db.collection('households').doc(householdId).set({
    name: `Família de teste ${householdId}`,
    subscription: assinatura,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('households').doc(householdId).collection('members').doc(uid).set({
    role: papel, name: 'Testador', createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('users').doc(uid).set({ householdId, name: 'Testador' });

  return uid;
}

async function limpar() {
  for (const householdId of [FAMILIA_PAGANTE, FAMILIA_TRIAL]) {
    const uid = `uid-${householdId}`;
    try { await admin.auth().deleteUser(uid); } catch { /* já foi */ }
    await db.collection('users').doc(uid).delete();

    const membros = await db.collection('households').doc(householdId).collection('members').get();
    for (const m of membros.docs) await m.ref.delete();
    await db.collection('households').doc(householdId).delete();

    for (const colecao of ['chatSessions', 'transactions', 'whatsappConfigs']) {
      const snap = await db.collection(colecao).where('householdId', '==', householdId).get();
      const lote = db.batch();
      snap.docs.forEach((d) => lote.delete(d.ref));
      if (snap.size) await lote.commit();
    }
    await db.collection('whatsappConfigs').doc(householdId).delete().catch(() => {});
  }
}

async function principal() {
  if (!API_KEY) {
    console.error('\n  Falta STAGING_WEB_API_KEY no ambiente.');
    console.error('  Pegue com: firebase apps:sdkconfig WEB --project staging\n');
    process.exit(1);
  }

  console.log('\nRota HTTP da assistente — teste contra a API de homologação\n');

  console.log('--- Sem token ---');
  const semToken = await chamar('/assistente/perguntar', { metodo: 'POST', corpo: { pergunta: 'oi' } });
  checar('recusa sem autenticação', semToken.status === 401, `status ${semToken.status}`);

  console.log('\n--- Conta em TRIAL (não deve conversar) ---');
  const uidTrial = await montarConta(FAMILIA_TRIAL, { pagante: false });
  const tokenTrial = await idTokenDe(uidTrial);

  const trialPergunta = await chamar('/assistente/perguntar', {
    token: tokenTrial, metodo: 'POST', corpo: { pergunta: 'quanto gastei?' },
  });
  checar('trial recebe 403, nunca 402', trialPergunta.status === 403, `status ${trialPergunta.status}`);
  checar('código é RECURSO_DE_ASSINANTE',
    trialPergunta.json?.codigo === 'RECURSO_DE_ASSINANTE', JSON.stringify(trialPergunta.json).slice(0, 150));
  checar('a recusa fala da ASSISTENTE, não de importação de extrato',
    /assistente/i.test(trialPergunta.json?.error || ''), trialPergunta.json?.error);

  // Regra 6: bloqueio de assinatura nunca esconde dado que já é da família.
  const trialUso = await chamar('/assistente/uso', { token: tokenTrial });
  checar('trial ainda consulta o próprio uso (leitura nunca é bloqueada)',
    trialUso.status === 200, `status ${trialUso.status}`);

  console.log('\n--- Conta PAGANTE ---');
  const uidPagante = await montarConta(FAMILIA_PAGANTE, { pagante: true });
  const tokenPagante = await idTokenDe(uidPagante);

  const uso0 = await chamar('/assistente/uso', { token: tokenPagante });
  checar('uso começa em 0%', uso0.json?.percentual === 0, JSON.stringify(uso0.json));

  const vazia = await chamar('/assistente/perguntar', {
    token: tokenPagante, metodo: 'POST', corpo: { pergunta: '   ' },
  });
  checar('pergunta vazia é recusada pelo validador', vazia.status === 400, `status ${vazia.status}`);

  const longa = await chamar('/assistente/perguntar', {
    token: tokenPagante, metodo: 'POST', corpo: { pergunta: 'a'.repeat(5000) },
  });
  checar('pergunta gigante é recusada', longa.status === 400, `status ${longa.status}`);

  const r1 = await chamar('/assistente/perguntar', {
    token: tokenPagante, metodo: 'POST', corpo: { pergunta: 'como foi meu mês?' },
  });
  checar('pagante conversa (200)', r1.status === 200, `status ${r1.status} — ${JSON.stringify(r1.json).slice(0, 200)}`);
  checar('resposta tem texto', !!r1.json?.texto, JSON.stringify(r1.json).slice(0, 200));
  checar('resposta informa o uso', typeof r1.json?.uso?.percentual === 'number', JSON.stringify(r1.json?.uso));
  checar('resposta lista as consultas usadas', Array.isArray(r1.json?.consultasUsadas));

  const usoDepois = await chamar('/assistente/uso', { token: tokenPagante });
  checar('uso subiu depois de perguntar',
    (usoDepois.json?.percentual || 0) > 0, JSON.stringify(usoDepois.json));

  console.log('\n--- Memória pela rota ---');
  const hist = await chamar('/assistente/historico', { token: tokenPagante });
  checar('histórico guardou a troca', (hist.json?.mensagens || []).length >= 2,
    `${(hist.json?.mensagens || []).length} mensagens`);

  const limpou = await chamar('/assistente/historico', { token: tokenPagante, metodo: 'DELETE' });
  checar('apaga a conversa', limpou.status === 200);

  const histVazio = await chamar('/assistente/historico', { token: tokenPagante });
  checar('histórico ficou vazio', (histVazio.json?.mensagens || []).length === 0);

  console.log('\n--- Isolamento pela rota ---');
  // O corpo tenta mandar outra família; o servidor precisa ignorar e usar a
  // família da sessão autenticada.
  const tentativa = await chamar('/assistente/perguntar', {
    token: tokenPagante,
    metodo: 'POST',
    corpo: { pergunta: 'quanto gastei?', householdId: FAMILIA_TRIAL, interlocutor: 'outro' },
  });
  checar('householdId no corpo é ignorado', tentativa.status === 200, `status ${tentativa.status}`);

  const histDepois = await chamar('/assistente/historico', { token: tokenPagante });
  checar('a conversa ficou na família autenticada',
    (histDepois.json?.mensagens || []).length >= 2, `${(histDepois.json?.mensagens || []).length}`);

  console.log('\n--- Limpeza ---');
  await limpar();
  const sobrou = await db.collection('households').doc(FAMILIA_PAGANTE).get();
  checar('contas de teste apagadas', !sobrou.exists);

  console.log(`\n${passou} passaram, ${falhou} falharam.\n`);
  process.exit(falhou > 0 ? 1 : 0);
}

principal().catch(async (err) => {
  console.error('\nErro no teste:', err.message);
  try { await limpar(); console.error('Limpeza feita.'); } catch { /* nada a fazer */ }
  process.exit(1);
});
