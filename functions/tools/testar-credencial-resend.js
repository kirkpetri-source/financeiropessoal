#!/usr/bin/env node
/**
 * Testa a credencial do Resend — SOMENTE LEITURA por padrão.
 *
 *   node tools/testar-credencial-resend.js                 # produção
 *   ALVO=staging node tools/testar-credencial-resend.js    # homologação
 *   node tools/testar-credencial-resend.js --enviar        # manda um e-mail de verdade
 *
 * Existe pelo mesmo motivo do `testar-credencial-mp.js`: quando o envio falhar
 * lá na frente, dentro de uma rota de suporte, a mensagem do provedor não vai
 * dizer QUAL é o problema. Chave errada, chave de outra conta, domínio ainda
 * não verificado e remetente de domínio diferente do verificado dão erros
 * parecidos e exigem correções completamente diferentes.
 *
 * NUNCA imprime a chave. Só formato, o que a API responde e a situação do
 * domínio.
 */

const { carregar, PROJETO, EH_STAGING } = require('./carregarAmbiente');

const API = 'https://api.resend.com';

async function main() {
  const enviar = process.argv.includes('--enviar');

  const { ok, faltando } = carregar(['RESEND_API_KEY']);
  if (!ok) {
    console.error(`RESEND_API_KEY não encontrada (${faltando.join(', ')}).`);
    console.error(`Grave com: firebase functions:secrets:set RESEND_API_KEY --project ${EH_STAGING ? 'staging' : 'prod'}`);
    process.exit(1);
  }

  const bruto = process.env.RESEND_API_KEY;
  const chave = bruto.trim();
  const remetente = process.env.SUPORTE_EMAIL_REMETENTE;
  const destino = process.env.SUPORTE_EMAIL_DESTINO;

  console.log(`Projeto: ${PROJETO}\n`);

  console.log('Formato');
  console.log(`  comprimento     ${chave.length} caracteres`);
  console.log(`  prefixo re_     ${chave.startsWith('re_') ? 'sim' : 'NÃO — não parece chave do Resend'}`);
  console.log(`  sujeira nas pontas  ${bruto !== chave ? 'SIM — o valor gravado tem espaço ou quebra de linha' : 'não'}`);

  if (bruto !== chave) {
    console.log('\nATENÇÃO: espaço ou quebra de linha no valor gravado faz o provedor');
    console.log('recusar com 401, e o diagnóstico vira caça ao fantasma. Regrave o segredo.');
  }

  const cabecalhos = { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };

  console.log('\nDomínios da conta');
  const resposta = await fetch(`${API}/domains`, { headers: cabecalhos });
  const corpo = await resposta.text();

  // Chave restrita a envio é o que se QUER aqui: a function só precisa mandar
  // e-mail, e uma chave com acesso total ao painel dentro de um container é
  // privilégio a mais sem ganho nenhum. O Resend responde 401 a qualquer
  // leitura nesse caso — e 401 aqui não é credencial ruim, é a credencial
  // fazendo o trabalho dela. Confundir os dois manda a pessoa gerar chave nova
  // com MAIS permissão para "resolver", que é o oposto do certo.
  const restrita = resposta.status === 401 && /restricted_api_key/.test(corpo);
  let dominios = null;

  if (restrita) {
    console.log('  não dá para listar: a chave é restrita a ENVIO (Sending access).');
    console.log('  Isso é o correto — menor privilégio. A validação vem do envio, abaixo.');
  } else if (resposta.status === 401) {
    console.log('  401 — a chave foi recusada. É de outra conta, foi revogada, ou está incompleta.');
    console.log(`  resposta: ${corpo.slice(0, 200)}`);
    process.exit(1);
  } else if (!resposta.ok) {
    console.log(`  ${resposta.status} — ${corpo.slice(0, 200)}`);
    process.exit(1);
  } else {
    dominios = JSON.parse(corpo).data || [];
    if (!dominios.length) {
      console.log('  nenhum domínio cadastrado nesta conta.');
      process.exit(1);
    }
    for (const d of dominios) console.log(`  ${d.name}  ${d.status}  (${d.region})`);
  }

  // O remetente precisa ser de um domínio VERIFICADO desta conta. Remetente de
  // domínio alheio é aceito na chamada e recusado na entrega — falha silenciosa
  // do pior tipo, porque o log da aplicação registra sucesso.
  console.log('\nRemetente configurado');
  console.log(`  SUPORTE_EMAIL_REMETENTE  ${remetente || 'AUSENTE'}`);
  console.log(`  SUPORTE_EMAIL_DESTINO    ${destino || 'AUSENTE'}`);

  if (!remetente) {
    console.log('\nSem SUPORTE_EMAIL_REMETENTE no .env do projeto, não há o que validar.');
    process.exit(1);
  }

  const dominioDoRemetente = remetente.split('@')[1] || '';

  if (dominios) {
    const casado = dominios.find((d) => d.name === dominioDoRemetente);

    if (!casado) {
      console.log(`\nPROBLEMA: "${dominioDoRemetente}" não está nesta conta do Resend.`);
      console.log('O envio seria aceito e nunca entregue. Corrija o remetente ou cadastre o domínio.');
      process.exit(1);
    }
    if (casado.status !== 'verified') {
      console.log(`\nPROBLEMA: "${dominioDoRemetente}" está como "${casado.status}", não "verified".`);
      console.log('Confira os registros DNS no Resend antes de seguir.');
      process.exit(1);
    }
    console.log(`\nOK: a chave é válida e "${dominioDoRemetente}" está verificado.`);
  } else {
    console.log(`\nA chave é restrita a envio, então "${dominioDoRemetente}" não pode ser`);
    console.log('conferido daqui. Só o envio de verdade prova que ele está verificado:');
    console.log('remetente de domínio não verificado é recusado na hora, com 403.');
  }

  if (!enviar) {
    console.log('\nNenhum e-mail foi enviado. Rode com --enviar para mandar um de verdade.');
    process.exit(0);
  }

  if (!destino) {
    console.error('\nSUPORTE_EMAIL_DESTINO ausente — sem para onde mandar.');
    process.exit(1);
  }

  console.log(`\nEnviando para ${destino}...`);
  const envio = await fetch(`${API}/emails`, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify({
      from: `RevelaCash <${remetente}>`,
      to: [destino],
      subject: `Teste de credencial do Resend (${PROJETO})`,
      text: [
        'Este e-mail confirma que o RevelaCash consegue enviar pelo Resend.',
        '',
        `Projeto: ${PROJETO}`,
        `Remetente: ${remetente}`,
        '',
        'Nenhum dado de cliente foi usado para gerar esta mensagem.',
      ].join('\n'),
    }),
  });

  if (!envio.ok) {
    console.error(`  falhou: ${envio.status} — ${(await envio.text()).slice(0, 300)}`);
    process.exit(1);
  }

  const { id } = await envio.json();
  console.log(`  enviado. id: ${id}`);
  console.log('\nConfira a caixa de entrada. Se não chegar em alguns minutos, veja');
  console.log('o painel do Resend em Emails — lá aparece se foi entregue ou recusado.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Falha:', err.message);
  process.exit(1);
});
