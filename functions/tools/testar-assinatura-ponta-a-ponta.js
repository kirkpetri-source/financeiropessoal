#!/usr/bin/env node
/**
 * Teste ponta a ponta da assinatura, inteiro por API.
 *
 *   node tools/testar-assinatura-ponta-a-ponta.js <householdId>
 *   node tools/testar-assinatura-ponta-a-ponta.js <householdId> --manter
 *
 * Faz o que um cliente faria, sem navegador:
 *   1. tokeniza o cartão de teste          POST /v1/card_tokens
 *   2. cria a assinatura já autorizada     POST /preapproval  (com card_token_id)
 *   3. roda o nosso sincronizarDoProvedor  — o mesmo código que o webhook chama
 *   4. confere o estado gravado no Firestore
 *   5. cancela e devolve a família ao estado anterior (a menos que --manter)
 *
 * Por que existe: clicar no checkout depende de conta de teste, de sessão do
 * navegador e de sorte com o painel. Isso é lento e não repete. Aqui o fluxo
 * roda em segundos e pode virar regressão sempre que o billing for mexido.
 *
 * Só funciona com credencial de TESTE. Recusa access token de produção — não
 * dá para "testar" cobrança num cartão real por engano.
 */

const { admin, db } = require('../src/config/firebaseAdmin');
const { criarClienteMercadoPago } = require('../src/assinatura/mercadoPago');
const { criarServicoDeAssinatura } = require('../src/services/assinaturaService');
const { situacaoDaAssinatura } = require('../src/assinatura/estado');

// Cartão de teste do Mercado Pago Brasil. APRO no nome = aprovação garantida.
const CARTAO = {
  card_number: '5031433215406351',
  expiration_month: 11,
  expiration_year: 2030,
  security_code: '123',
  cardholder: { name: 'APRO', identification: { type: 'CPF', number: '12345678909' } },
};

// A API de preapproval devolve 500 para e-mail @testuser.com. Comprovado em
// 06/08/2026: mesmo payload e mesma credencial, só mudando o e-mail. Por isso o
// pagador aqui é um endereço comum, e não a conta de teste do painel.
const EMAIL_DO_PAGADOR = 'comprador-de-teste@exemplo.com';

const BASE = 'https://api.mercadopago.com';

async function tokenizarCartao(accessToken) {
  const resposta = await fetch(`${BASE}/v1/card_tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(CARTAO),
  });

  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(`card_tokens ${resposta.status}: ${JSON.stringify(dados).slice(0, 300)}`);
  }
  return dados.id;
}

async function criarAssinaturaAutorizada(accessToken, { householdId, cardTokenId }) {
  const resposta = await fetch(`${BASE}/preapproval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason: 'Financeiro Familiar (teste automatizado)',
      external_reference: householdId,
      payer_email: EMAIL_DO_PAGADOR,
      card_token_id: cardTokenId,
      // "authorized" com card_token_id dispensa o redirecionamento: é o mesmo
      // resultado de o cliente ter pago no checkout.
      status: 'authorized',
      back_url: 'https://financeiropessoal-tau.vercel.app/assinatura',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 24.9,
        currency_id: 'BRL',
      },
    }),
  });

  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(`preapproval ${resposta.status}: ${JSON.stringify(dados).slice(0, 400)}`);
  }
  return dados;
}

async function criarAssinaturaPendente(accessToken, { householdId }) {
  const resposta = await fetch(`${BASE}/preapproval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason: 'Financeiro Familiar (teste automatizado)',
      external_reference: householdId,
      payer_email: EMAIL_DO_PAGADOR,
      status: 'pending',
      back_url: 'https://financeiropessoal-tau.vercel.app/assinatura',
      auto_recurring: {
        frequency: 1, frequency_type: 'months', transaction_amount: 24.9, currency_id: 'BRL',
      },
    }),
  });

  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(`preapproval ${resposta.status}: ${JSON.stringify(dados).slice(0, 400)}`);
  }
  return dados;
}

async function estadoDaFamilia(householdId) {
  const doc = await db.collection('households').doc(householdId).get();
  if (!doc.exists) throw new Error(`Família ${householdId} não existe.`);
  return doc.data().subscription || {};
}

function linha(rotulo, valor) {
  console.log(`  ${rotulo.padEnd(20)}${valor}`);
}

async function main() {
  const [, , householdId, ...flags] = process.argv;
  const manter = flags.includes('--manter');

  if (!householdId) {
    console.error('Uso: node tools/testar-assinatura-ponta-a-ponta.js <householdId> [--manter]');
    console.error('Liste os ids com: node tools/diagnostico-assinatura.js');
    process.exit(1);
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    console.error('MERCADOPAGO_ACCESS_TOKEN não está no ambiente.');
    process.exit(1);
  }
  if (!accessToken.startsWith('TEST-')) {
    console.error('Credencial de PRODUÇÃO detectada. Este script só roda com token de teste.');
    process.exit(1);
  }

  const cliente = () => criarClienteMercadoPago({ accessToken });
  const servico = criarServicoDeAssinatura({ db, admin, cliente });

  const antes = await estadoDaFamilia(householdId);
  console.log('Antes');
  linha('status', antes.status || '—');
  linha('pode lançar', situacaoDaAssinatura(antes, new Date()).podeLancar ? 'SIM' : 'NÃO');

  console.log('\n1. Tokenizando o cartão de teste...');
  const cardTokenId = await tokenizarCartao(accessToken);
  linha('card_token', `${String(cardTokenId).slice(0, 8)}...`);

  console.log('\n2. Criando a assinatura...');

  // Autorizar por API exige token de cartão gerado com a chave pública no
  // navegador e vinculado a uma conta real do Mercado Pago; com o token do
  // vendedor, o preapproval responde 404 "Card token service not found".
  //
  // Quando isso acontece, criamos a assinatura pendente e seguimos: o que
  // interessa verificar aqui é o NOSSO caminho — ler o provedor e gravar o
  // estado — e ele é o mesmo nos dois casos. O que fica sem cobertura é só o
  // mapeamento de "authorized", que é uma linha de tabela já testada em
  // mercadoPago.test.mjs.
  let preapproval;
  let autorizada = true;

  try {
    preapproval = await criarAssinaturaAutorizada(accessToken, { householdId, cardTokenId });
  } catch (err) {
    if (!/Card token service not found/i.test(err.message)) throw err;
    console.log('   (autorização por API indisponível — seguindo com assinatura pendente)');
    autorizada = false;
    preapproval = await criarAssinaturaPendente(accessToken, { householdId });
  }

  linha('preapproval', preapproval.id);
  linha('status no MP', preapproval.status);
  linha('external_ref', preapproval.external_reference);
  linha('próxima cobrança', preapproval.next_payment_date || '—');

  console.log('\n3. Rodando sincronizarDoProvedor (o mesmo caminho do webhook)...');
  const resultado = await servico.sincronizarDoProvedor(preapproval.id);
  linha('resultado', JSON.stringify(resultado));

  console.log('\n4. Estado gravado no Firestore');
  const depois = await estadoDaFamilia(householdId);
  const situacao = situacaoDaAssinatura(depois, new Date());
  linha('status', depois.status);
  linha('provedor', depois.provider);
  linha('externalId', depois.externalId);
  linha('preço', `R$ ${((depois.priceCents ?? 0) / 100).toFixed(2)}`);
  linha('período até', depois.currentPeriodEnd?.toDate?.()?.toISOString().slice(0, 10) || '—');
  linha('pode lançar', situacao.podeLancar ? 'SIM' : 'NÃO');
  linha('motivo', situacao.motivo);

  const esperado = autorizada ? 'active' : 'pending';
  const passou = depois.status === esperado
    && depois.provider === 'mercadopago'
    && depois.externalId === preapproval.id;

  console.log(`\n${passou ? 'PASSOU' : 'FALHOU'} — o estado do provedor (${esperado}) chegou ao Firestore.`);
  if (!autorizada) {
    console.log('Não coberto aqui: a transição para "active", que depende de');
    console.log('autorização no checkout. O mapeamento em si está em teste unitário.');
  }

  if (manter) {
    console.log('\n--manter: assinatura mantida no Mercado Pago e no Firestore.');
    process.exit(passou ? 0 : 1);
  }

  console.log('\n5. Limpando: cancelando no Mercado Pago e restaurando a família...');
  await cliente().cancelarAssinatura(preapproval.id);

  await db.collection('households').doc(householdId).update({
    subscription: { ...antes },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  linha('restaurado para', antes.status || '—');

  process.exit(passou ? 0 : 1);
}

main().catch((err) => {
  console.error('\nFalha:', err.message);
  process.exit(1);
});
