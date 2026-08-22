#!/usr/bin/env node
/**
 * Cria (ou reseta a senha d)o login do painel do operador (/plataforma), e o
 * registro dele em `operadores/{uid}`.
 *
 *   node tools/criar-login-operador.js                        # simulação
 *   node tools/criar-login-operador.js --confirmar            # aplica
 *   node tools/criar-login-operador.js maria --papel ATENDENTE --nome "Maria" --confirmar
 *   node tools/criar-login-operador.js kirkdouglas_19 --manter-senha --confirmar
 *   ALVO=staging node tools/criar-login-operador.js --confirmar
 *
 * São DUAS coisas, e as duas são necessárias:
 *
 *   1. conta no Firebase Auth — é o que autentica. Conta separada da pessoal,
 *      sem família (household) associada. "Usuário" vira um e-mail interno
 *      (nunca uma caixa real, ninguém lê) só porque o Firebase Auth exige
 *      formato de e-mail; a tela de /plataforma pede usuário/senha.
 *
 *   2. documento em `operadores/{uid}` — é o que `apenasOperadorAtivo` lê para
 *      deixar a pessoa ATENDER chamado. Sem ele, o login existe e não abre
 *      nada: o middleware responde 403 NAO_E_OPERADOR.
 *
 * O `papel` é informativo nesta etapa (o que cada um pode fazer é a etapa 2).
 * Quem manda em acesso ADMINISTRATIVO continua sendo `ADMIN_EMAILS` no
 * `.env.<projeto>`, que exige deploy para mudar. Atender chamado, não: sai do
 * Firestore e vale na requisição seguinte.
 *
 * Criar operador pela tela é a etapa 2. Até lá, é por aqui.
 */

const crypto = require('crypto');
const { admin, db } = require('../src/config/firebaseAdmin');

const DOMINIO_INTERNO = 'operador.revelacash.internal';
const PAPEIS = ['ADMIN', 'ATENDENTE'];

function gerarSenha(tamanho = 24) {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%*';
  const bytes = crypto.randomBytes(tamanho);
  let senha = '';
  for (let i = 0; i < tamanho; i++) senha += alfabeto[bytes[i] % alfabeto.length];
  return senha;
}

/** Lê `--chave valor` do argv. Devolve null quando a flag não veio. */
function opcao(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i !== -1 ? (process.argv[i + 1] || null) : null;
}

async function main() {
  const args = process.argv.slice(2);
  const confirmar = args.includes('--confirmar');
  const reativar = args.includes('--reativar');

  // Quem já tem login e só precisa do registro em `operadores` não deveria
  // perder a senha por isso. Sem esta flag, "cadastrar o operador" trocaria a
  // senha que a pessoa já usa — surpresa cara quando o login é o do painel de
  // produção e ela descobre na hora de entrar.
  const manterSenha = args.includes('--manter-senha');

  // Primeiro argumento posicional que não é flag nem valor de flag.
  const usuario = args.find((a, i) => (
    !a.startsWith('--') && !['--nome', '--papel'].includes(args[i - 1])
  )) || 'kirkdouglas_19';

  const emailInterno = `${usuario}@${DOMINIO_INTERNO}`;

  const papel = (opcao('papel') || 'ATENDENTE').toUpperCase();
  if (!PAPEIS.includes(papel)) {
    console.error(`Papel "${papel}" não existe. Use ${PAPEIS.join(' ou ')}.`);
    process.exit(1);
  }

  const nome = opcao('nome') || usuario;

  const existente = await admin.auth().getUserByEmail(emailInterno).catch(() => null);
  const registro = existente
    ? await db.collection('operadores').doc(existente.uid).get()
    : null;
  const jaCadastrado = !!registro?.exists;
  const estavaAtivo = jaCadastrado ? registro.data().ativo === true : null;

  console.log(`Usuário: ${usuario}`);
  console.log(`E-mail interno: ${emailInterno}`);
  console.log(`Nome: ${nome}`);
  console.log(`Papel: ${papel}${papel === 'ATENDENTE' ? ' (padrão — menor privilégio)' : ''}`);
  const vaiTrocarSenha = !existente || !manterSenha;

  console.log(`Login: ${existente
    ? (manterSenha ? 'já existe, a senha NÃO será tocada' : 'já existe, a senha seria REDEFINIDA')
    : 'não existe, seria criado'}`);
  console.log(`Registro em operadores: ${jaCadastrado ? `já existe, ativo=${estavaAtivo}` : 'seria criado com ativo=true'}`);

  // Resetar senha NÃO pode religar quem foi desligado. Sem esta trava, "só
  // vou redefinir a senha dele" devolve o acesso de um ex-atendente em
  // silêncio — e o script parece ter feito exatamente o que se pediu.
  if (jaCadastrado && !estavaAtivo && !reativar) {
    console.log('\nATENÇÃO: este operador está DESATIVADO.');
    console.log('A senha seria redefinida, mas o acesso continuaria desligado.');
    console.log('Para religar de propósito, rode de novo com --reativar.');
  }

  if (existente && !manterSenha) {
    console.log('\nATENÇÃO: a senha atual deste login será TROCADA.');
    console.log('Se você só quer cadastrar o operador, rode com --manter-senha.');
  }

  if (!confirmar) {
    console.log('\nSIMULAÇÃO — nada foi alterado. Rode de novo com --confirmar para aplicar.');
    process.exit(0);
  }

  const senha = vaiTrocarSenha ? gerarSenha() : null;

  const uid = existente
    ? (await admin.auth().updateUser(existente.uid, {
      ...(senha ? { password: senha } : {}), emailVerified: true, disabled: false,
    })).uid
    : (await admin.auth().createUser({
      email: emailInterno, emailVerified: true, password: senha, displayName: nome,
    })).uid;

  const dados = {
    uid,
    nome,
    papel,
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  };

  // `ativo` só é escrito quando o registro nasce ou quando se pede --reativar.
  // Fora disso ele é preservado: quem estava desligado continua desligado.
  if (!jaCadastrado || reativar) dados.ativo = true;
  if (!jaCadastrado) dados.criadoEm = admin.firestore.FieldValue.serverTimestamp();

  await db.collection('operadores').doc(uid).set(dados, { merge: true });

  const ficouAtivo = dados.ativo === true || estavaAtivo === true;

  console.log('\nOK.');
  console.log(`  usuário: ${usuario}`);
  console.log(`  uid: ${uid}`);
  console.log(`  papel: ${papel}`);
  console.log(`  ativo: ${dados.ativo === true ? 'true' : `preservado (${estavaAtivo})`}`);
  console.log(senha
    ? `  senha (anote agora, não aparece de novo): ${senha}`
    : '  senha: inalterada (--manter-senha)');

  if (ficouAtivo) {
    console.log('\nIsto já libera ATENDER chamado de suporte.');
  } else {
    console.log('\nA senha foi trocada, mas o acesso CONTINUA DESLIGADO: esta pessoa');
    console.log('não atende chamado. Rode com --reativar para religar.');
  }

  console.log('Para o painel ADMINISTRATIVO (métricas, clientes, cobrança), o');
  console.log('e-mail interno acima precisa estar em ADMIN_EMAILS');
  console.log('(functions/.env.<projeto>) e a function precisa de redeploy.');
  process.exit(0);
}

main().catch((err) => { console.error('Falha:', err.message); process.exit(1); });
