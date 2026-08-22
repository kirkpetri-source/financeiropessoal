/**
 * Diagnóstico SOMENTE LEITURA da conta WhatsApp Cloud API (Meta).
 *
 * Responde a pergunta que trava a migração: **o que exatamente falta?** As
 * duas causas possíveis pedem coisas diferentes de gente diferente:
 *
 *   - falta forma de pagamento na conta de anúncios     -> o Kirk resolve em 5 min
 *   - falta análise/aprovação da Meta (review pendente) -> ninguém resolve, só esperar
 *
 * O sintoma de superfície é o mesmo (`can_send_message: BLOCKED`, erro 141006),
 * então perguntar à API qual é o motivo evita tanto esperar por algo que
 * dependia de um clique quanto clicar em algo que dependia de espera.
 *
 * Não escreve nada em lugar nenhum — nem na Meta, nem no Firestore.
 *
 *   node tools/diagnostico-cloud-api.js
 */

const { carregar } = require('./carregarAmbiente');

const VERSAO = 'v21.0';
const BASE = `https://graph.facebook.com/${VERSAO}`;

// Identificadores fixos da conta, registrados no ESTADO.md em 10/08/2026.
const WABA_ID = process.env.WHATSAPP_WABA_ID || '1517576109683204';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '1229153730286556';
const APP_ID = process.env.WHATSAPP_APP_ID || '1581075037136939';

const { ok, faltando } = carregar(['WHATSAPP_CLOUD_API_TOKEN']);

if (!ok) {
  console.error(`\nSegredo ausente: ${faltando.join(', ')}.`);
  console.error('Sem o token não há como perguntar nada à Meta. Confira se o');
  console.error('firebase CLI está logado no projeto de produção.\n');
  process.exit(1);
}

const TOKEN = process.env.WHATSAPP_CLOUD_API_TOKEN;

async function perguntar(caminho) {
  const url = `${BASE}/${caminho}${caminho.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(TOKEN)}`;
  const resposta = await fetch(url);
  const texto = await resposta.text();

  let corpo;
  try {
    corpo = JSON.parse(texto);
  } catch {
    corpo = { texto };
  }

  return { status: resposta.status, corpo };
}

function linha(rotulo, valor) {
  console.log(`  ${rotulo.padEnd(28)} ${valor ?? '(não informado)'}`);
}

/** Traduz o veredito da Meta para o que precisa ser FEITO, e por quem. */
function veredito({ numero, waba, assinaturas }) {
  const pendencias = [];

  const podeEnviar = numero?.status;
  const revisao = waba?.account_review_status;
  const limite = numero?.messaging_limit_tier || waba?.messaging_limits;

  if (revisao && revisao !== 'APPROVED') {
    pendencias.push({
      quem: 'META',
      texto: `A conta comercial está em "${revisao}" — a análise ainda não terminou. Não há o que clicar; é esperar.`,
    });
  }

  if (podeEnviar && podeEnviar !== 'CONNECTED') {
    pendencias.push({
      quem: 'KIRK',
      texto: `O número está em "${podeEnviar}" e não "CONNECTED".`,
    });
  }

  if (!assinaturas?.data?.length) {
    pendencias.push({
      quem: 'CLAUDE',
      texto: 'O app não está inscrito no webhook de mensagens da WABA (subscribed_apps vazio) — isso é chamada de API, resolvo por script.',
    });
  }

  console.log('\n=== O QUE FALTA ===\n');

  if (!pendencias.length) {
    console.log('  Nada bloqueando pelo que a API mostra. O próximo passo é o');
    console.log('  teste de ponta a ponta do cloudApiProvider.js contra a API real.');
  }

  for (const p of pendencias) {
    const dono = { KIRK: 'KIRK RESOLVE', META: 'ESPERAR A META', CLAUDE: 'EU RESOLVO' }[p.quem];
    console.log(`  [${dono}] ${p.texto}`);
  }

  if (limite) console.log(`\n  Limite de envio hoje: ${JSON.stringify(limite)}`);
}

(async () => {
  console.log('\n=== CONTA COMERCIAL (WABA) ===\n');
  const waba = await perguntar(
    `${WABA_ID}?fields=id,name,currency,timezone_id,account_review_status,business_verification_status,message_template_namespace,owner_business_info,primary_funding_id`
  );

  if (waba.status !== 200) {
    console.log(`  HTTP ${waba.status}`);
    console.log('  ' + JSON.stringify(waba.corpo, null, 2).replace(/\n/g, '\n  '));
  } else {
    linha('nome', waba.corpo.name);
    linha('id', waba.corpo.id);
    linha('análise da conta', waba.corpo.account_review_status);
    linha('verificação do negócio', waba.corpo.business_verification_status);
    linha('moeda', waba.corpo.currency);
    linha('fonte de pagamento', waba.corpo.primary_funding_id);
  }

  console.log('\n=== NÚMERO ===\n');
  const numero = await perguntar(
    `${PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,platform_type,throughput,status,name_status,messaging_limit_tier,account_mode,is_official_business_account`
  );

  if (numero.status !== 200) {
    console.log(`  HTTP ${numero.status}`);
    console.log('  ' + JSON.stringify(numero.corpo, null, 2).replace(/\n/g, '\n  '));
  } else {
    linha('número', numero.corpo.display_phone_number);
    linha('nome verificado', numero.corpo.verified_name);
    linha('status do nome', numero.corpo.name_status);
    linha('status da conexão', numero.corpo.status);
    linha('qualidade', numero.corpo.quality_rating);
    linha('faixa de envio', numero.corpo.messaging_limit_tier);
    linha('modo da conta', numero.corpo.account_mode);
    linha('conta oficial (OBA)', String(numero.corpo.is_official_business_account));
    linha('plataforma', numero.corpo.platform_type);
    linha('verificação do código', numero.corpo.code_verification_status);
  }

  console.log('\n=== WEBHOOK: APPS INSCRITOS NA WABA ===\n');
  const assinaturas = await perguntar(`${WABA_ID}/subscribed_apps`);
  if (assinaturas.status !== 200) {
    console.log(`  HTTP ${assinaturas.status}`);
    console.log('  ' + JSON.stringify(assinaturas.corpo, null, 2).replace(/\n/g, '\n  '));
  } else if (!assinaturas.corpo?.data?.length) {
    console.log('  Nenhum app inscrito. Mensagem recebida não chegaria em lugar nenhum.');
  } else {
    for (const app of assinaturas.corpo.data) {
      console.log(`  ${app.whatsapp_business_api_data?.name || '(sem nome)'} — id ${app.whatsapp_business_api_data?.id}`);
    }
  }

  console.log('\n=== CRÉDITO / COBRANÇA ===\n');
  const credito = await perguntar(`${WABA_ID}?fields=primary_business_location,on_behalf_of_business_info`);
  if (credito.status === 200) {
    console.log('  ' + JSON.stringify(credito.corpo, null, 2).replace(/\n/g, '\n  '));
  } else {
    console.log(`  HTTP ${credito.status} — ${JSON.stringify(credito.corpo?.error?.message || credito.corpo)}`);
  }

  veredito({
    numero: numero.status === 200 ? numero.corpo : null,
    waba: waba.status === 200 ? waba.corpo : null,
    assinaturas: assinaturas.status === 200 ? assinaturas.corpo : null,
  });

  console.log(`\n(app ${APP_ID}, WABA ${WABA_ID}, número ${PHONE_NUMBER_ID})\n`);
})().catch((e) => {
  console.error('\nFalhou:', e.message, '\n');
  process.exit(1);
});
