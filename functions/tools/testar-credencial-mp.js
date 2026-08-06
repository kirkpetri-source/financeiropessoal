#!/usr/bin/env node
/**
 * Testa a credencial do Mercado Pago — SOMENTE LEITURA.
 *
 *   $env:MERCADOPAGO_ACCESS_TOKEN = "<token>"
 *   node tools/testar-credencial-mp.js
 *
 * Existe porque "Mercado Pago 401: Unauthorized access to resource" não diz
 * QUAL é o problema: token errado, token de outro ambiente, ou Public Key
 * colada no lugar do Access Token — os três dão o mesmo 401.
 *
 * NUNCA imprime o token. Só formato, ambiente e o que a API responde.
 */

// Public Key e Access Token ambos começam com TEST- em ambiente de teste. O que
// os distingue é o formato: a Public Key é um UUID, o Access Token não.
const FORMATO_PUBLIC_KEY = /^(TEST|APP_USR)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const bruto = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!bruto) {
    console.error('MERCADOPAGO_ACCESS_TOKEN não está no ambiente.');
    process.exit(1);
  }

  const token = bruto.trim();

  // Só o rótulo do ambiente, nunca pedaço do valor.
  //
  // A versão anterior imprimia `token.split('-')[0]` como "prefixo". Num valor
  // sem hífen — que é justamente o caso quando alguém cola o webhook secret
  // aqui por engano — isso devolve a string inteira e vaza a credencial no
  // terminal e no log. Diagnóstico não pode expor o que está diagnosticando.
  const prefixo = /^(TEST|APP_USR)-/.exec(token)?.[1] || null;

  console.log('Formato');
  console.log(`  comprimento        ${token.length} caracteres`);
  console.log(`  prefixo conhecido  ${prefixo || 'nenhum (não parece credencial do Mercado Pago)'}`);
  console.log(`  só hexadecimal     ${/^[0-9a-f]+$/i.test(token) ? 'SIM — tem cara de webhook secret, não de token' : 'não'}`);
  console.log(`  espaço/quebra      ${bruto !== token ? 'SIM — o valor gravado tem sujeira nas pontas' : 'não'}`);

  if (FORMATO_PUBLIC_KEY.test(token)) {
    console.log('\nPROBLEMA ENCONTRADO: isto é uma PUBLIC KEY, não um Access Token.');
    console.log('A Public Key é um UUID e serve para o frontend. O Access Token');
    console.log('é mais longo e tem números no meio. Pegue o campo "Access Token"');
    console.log('na mesma tela de credenciais e grave de novo.');
    process.exit(1);
  }

  if (!prefixo) {
    console.log('\nPROBLEMA: o valor não começa com TEST- nem APP_USR-.');
    if (/^[0-9a-f]{32,}$/i.test(token)) {
      console.log('O formato é hexadecimal puro, que é a cara do WEBHOOK SECRET.');
      console.log('Provavelmente os dois valores foram trocados de lugar.');
    }
    console.log('O Access Token está em: Suas integrações -> sua aplicação ->');
    console.log('Credenciais -> campo "Access Token".');
    process.exit(1);
  }

  const ambiente = token.startsWith('TEST-') ? 'TESTE' : 'PRODUÇÃO';
  console.log(`  ambiente           ${ambiente}`);

  // /users/me é a chamada mais barata que exige autenticação. Se ela passa, o
  // token é válido; se falha, o problema é a credencial e não o preapproval.
  console.log('\nConsultando /users/me...');
  const resposta = await fetch('https://api.mercadopago.com/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });

  const corpo = await resposta.text();

  if (!resposta.ok) {
    console.log(`  HTTP ${resposta.status}`);
    console.log(`  resposta: ${corpo.slice(0, 300)}`);
    console.log('\nO token não autentica. Copie de novo em: Suas integrações ->');
    console.log('sua aplicação -> Credenciais -> campo "Access Token".');
    process.exit(1);
  }

  const dados = JSON.parse(corpo);
  console.log(`  HTTP ${resposta.status} — token válido`);
  console.log(`  conta              ${dados.nickname || dados.id}`);
  console.log(`  país               ${dados.site_id}`);
  console.log(`  tipo               ${dados.user_type || '—'}`);

  // A conta de teste (test user) tem site_id e é marcada como tal. Criar
  // preapproval com credencial de conta de teste é o caminho certo em teste.
  console.log('\nTestando permissão de assinatura (GET /preapproval/search)...');
  const busca = await fetch('https://api.mercadopago.com/preapproval/search?limit=1', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (busca.ok) {
    console.log('  OK — a credencial tem acesso ao recurso de assinaturas.');
    console.log('\nCredencial está boa. Se o checkout ainda falhar, o problema');
    console.log('está nos dados enviados no preapproval, não na autenticação.');
  } else {
    const erro = await busca.text();
    console.log(`  HTTP ${busca.status}: ${erro.slice(0, 300)}`);
    console.log('\nO token autentica mas NÃO tem acesso a assinaturas.');
    console.log('Confira se a aplicação foi criada com a solução "Assinaturas"');
    console.log('e se as credenciais são dessa aplicação.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\nFalha:', err.message);
  process.exit(1);
});
