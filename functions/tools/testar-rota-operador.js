#!/usr/bin/env node
/**
 * Prova, pela API HTTP de verdade, que atendente NÃO é administrador.
 *
 *   ALVO=staging node tools/testar-rota-operador.js
 *
 * É o único teste que consegue provar isso. Os de unidade chamam os services
 * direto e nunca passam pelo Express; e importar `app.js` dentro do vitest
 * arrasta `firebaseAdmin` no topo de `routes/admin.js`, o que a trava da regra
 * 2 derruba. `__testes__/ordemDasRotas.test.mjs` guarda a ordem lendo o código,
 * mas ler não é executar.
 *
 * A armadilha que ele existe para pegar: `routes/admin.js` aplica `apenasAdmin`
 * a tudo que registra depois dele. Se `/plataforma/chamados` for montado DEPOIS
 * de `/plataforma` no `app.js`, o Express manda a requisição para o router do
 * admin — e todo atendente vira administrador, sem erro nenhum aparecer.
 *
 * Cria um atendente descartável, faz login de verdade, bate nas duas rotas e
 * apaga tudo no fim.
 */

const { carregar, ALVO, PROJETO } = require('./carregarAmbiente');

if (ALVO !== 'staging') {
  console.error('Este teste só roda em homologação. Use:');
  console.error('  ALVO=staging node tools/testar-rota-operador.js');
  process.exit(1);
}

carregar();

const { admin, db } = require('../src/config/firebaseAdmin');
const householdService = require('../src/services/householdService');
const lgpdService = require('../src/services/lgpdService');
const chamadoService = require('../src/services/chamadoService');
const { escopoDe } = require('../src/data/escopo');

const API = (process.env.API_BASE_URL || '').replace(/\/$/, '');
const CHAVE_WEB = process.env.STAGING_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;

const USUARIO_TESTE = 'atendente-de-teste';
const EMAIL_TESTE = `${USUARIO_TESTE}@operador.revelacash.internal`;
const SENHA_TESTE = `teste-${Math.random().toString(36).slice(2)}-${Date.now()}`;

const EMAIL_CLIENTE = `cliente-de-teste-${Date.now()}@example.invalid`;
const SENHA_CLIENTE = `teste-${Math.random().toString(36).slice(2)}`;

let verificacoes = 0;
let falhas = 0;

function conferir(rotulo, condicao, detalhe = '') {
  verificacoes += 1;
  console.log(`  [${condicao ? 'ok' : 'FALHA'}] ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

/** Login de verdade, pelo mesmo endpoint que o navegador usa. */
async function entrar(email, senha) {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${CHAVE_WEB}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha, returnSecureToken: true }),
    },
  );

  const corpo = await r.json();
  if (!r.ok) throw new Error(`Login falhou (${r.status}): ${corpo.error?.message}`);
  return corpo.idToken;
}

async function chamar(caminho, token) {
  const r = await fetch(`${API}${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
  const texto = await r.text();

  let corpo = null;
  try { corpo = JSON.parse(texto); } catch { corpo = texto.slice(0, 200); }

  return { status: r.status, corpo };
}

async function main() {
  console.log(`Teste de rota do operador — ${PROJETO}\n`);

  if (!API) throw new Error('API_BASE_URL ausente no .env de homologação.');
  if (!CHAVE_WEB) throw new Error('STAGING_WEB_API_KEY ausente. Pegue com: firebase apps:sdkconfig WEB --project staging');

  console.log(`  API: ${API}\n`);

  // --- monta o cenário -------------------------------------------------------
  const existente = await admin.auth().getUserByEmail(EMAIL_TESTE).catch(() => null);
  const atendente = existente
    ? await admin.auth().updateUser(existente.uid, { password: SENHA_TESTE, emailVerified: true, disabled: false })
    : await admin.auth().createUser({ email: EMAIL_TESTE, emailVerified: true, password: SENHA_TESTE, displayName: 'Atendente de Teste' });

  await db.collection('operadores').doc(atendente.uid).set({
    uid: atendente.uid, nome: 'Atendente de Teste', papel: 'ATENDENTE', ativo: true,
  });

  const cliente = await admin.auth().createUser({
    email: EMAIL_CLIENTE, emailVerified: true, password: SENHA_CLIENTE, displayName: 'Cliente de Teste',
  });

  const familia = await householdService.criarHousehold({
    nome: 'TESTE-ROTA-OPERADOR',
    ownerId: cliente.uid,
    ownerNome: 'Cliente de Teste',
    ownerEmail: EMAIL_CLIENTE,
  });

  const chamado = await chamadoService.abrirChamado(escopoDe(familia.id), {
    assunto: 'teste de rota',
    categoria: 'DUVIDA',
    texto: 'mensagem de teste',
    abertoPor: { uid: cliente.uid, nome: 'Cliente de Teste' },
  });

  console.log(`  atendente: ${atendente.uid}`);
  console.log(`  família:   ${familia.id}`);
  console.log(`  chamado:   #${chamado.numero}\n`);

  try {
    const tokenAtendente = await entrar(EMAIL_TESTE, SENHA_TESTE);
    const tokenCliente = await entrar(EMAIL_CLIENTE, SENHA_CLIENTE);

    console.log('1) O atendente atende');
    const fila = await chamar('/plataforma/chamados', tokenAtendente);
    conferir('GET /plataforma/chamados responde 200', fila.status === 200, `status ${fila.status}`);
    conferir('a fila enxerga o chamado da família', (fila.corpo?.chamados || [])
      .some((c) => c.numero === chamado.numero));

    const detalhe = await chamar(`/plataforma/chamados/${chamado.numero}`, tokenAtendente);
    conferir('GET /plataforma/chamados/:numero responde 200', detalhe.status === 200, `status ${detalhe.status}`);
    conferir('o detalhe traz as mensagens', (detalhe.corpo?.mensagens || []).length === 1);

    const operadores = await chamar('/plataforma/chamados/operadores', tokenAtendente);
    conferir(
      'GET /operadores não é engolido por /:numero',
      operadores.status === 200 && Array.isArray(operadores.corpo),
      `status ${operadores.status}`,
    );

    console.log('\n2) O MESMO atendente NÃO é administrador');
    const metricas = await chamar('/plataforma/metricas', tokenAtendente);
    conferir(
      'GET /plataforma/metricas responde 403',
      metricas.status === 403,
      `status ${metricas.status}`,
    );
    conferir(
      'e o motivo é NAO_E_ADMIN',
      metricas.corpo?.codigo === 'NAO_E_ADMIN',
      String(metricas.corpo?.codigo),
    );

    const familias = await chamar('/plataforma/familias', tokenAtendente);
    conferir('GET /plataforma/familias também responde 403', familias.status === 403, `status ${familias.status}`);

    console.log('\n3) Cliente comum não entra na fila');
    const doCliente = await chamar('/plataforma/chamados', tokenCliente);
    conferir('GET /plataforma/chamados responde 403 para cliente', doCliente.status === 403, `status ${doCliente.status}`);
    conferir('e o motivo é NAO_E_OPERADOR', doCliente.corpo?.codigo === 'NAO_E_OPERADOR', String(doCliente.corpo?.codigo));

    console.log('\n4) Atendente DESLIGADO para de atender na hora');
    await db.collection('operadores').doc(atendente.uid).update({ ativo: false });

    const depoisDeDesligar = await chamar('/plataforma/chamados', tokenAtendente);
    conferir(
      'o MESMO token agora responde 403',
      depoisDeDesligar.status === 403,
      'sem deploy, sem expirar token — o desligamento vale na requisição seguinte',
    );
    conferir('e o motivo é OPERADOR_INATIVO', depoisDeDesligar.corpo?.codigo === 'OPERADOR_INATIVO',
      String(depoisDeDesligar.corpo?.codigo));

    console.log('\n5) Sem token, nada');
    const semToken = await fetch(`${API}/plataforma/chamados`);
    conferir('GET sem Authorization responde 401', semToken.status === 401, `status ${semToken.status}`);
  } finally {
    console.log('\nLimpando...');
    await db.collection('supportTickets').doc(String(chamado.numero)).delete().catch(() => {});
    await db.collection('operadores').doc(atendente.uid).delete().catch(() => {});
    await admin.auth().deleteUser(atendente.uid).catch(() => {});
    await lgpdService.apagarHousehold(familia.id).catch(() => {});
    await admin.auth().deleteUser(cliente.uid).catch(() => {});
    console.log('  atendente, cliente, família e chamado removidos.');
  }

  console.log(`\n${verificacoes - falhas}/${verificacoes} verificações passaram.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nFalhou:', err.message);
  process.exit(1);
});
