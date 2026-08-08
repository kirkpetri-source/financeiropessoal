#!/usr/bin/env node
/**
 * Cria (ou reseta a senha d)o login do painel do operador (/plataforma).
 *
 *   node tools/criar-login-operador.js                # simulação
 *   node tools/criar-login-operador.js --confirmar     # cria ou reseta a senha
 *
 * É uma conta de Firebase Auth separada da conta pessoal do Kirk, sem
 * família (household) associada — só existe para autenticar o painel
 * administrativo. "Usuário" vira um e-mail interno (nunca uma caixa real,
 * ninguém lê) só porque o Firebase Auth exige formato de e-mail; a tela de
 * login em /plataforma pede usuário/senha, não e-mail.
 *
 * Depois de rodar, o usuário/senha precisam estar em ADMIN_EMAILS
 * (functions/.env.<projeto>) com o e-mail interno gerado aqui, e a function
 * precisa de um novo `firebase deploy --only functions` pra isso valer.
 */

const crypto = require('crypto');
const { admin } = require('../src/config/firebaseAdmin');

const DOMINIO_INTERNO = 'operador.revelacash.internal';

function gerarSenha(tamanho = 24) {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%*';
  const bytes = crypto.randomBytes(tamanho);
  let senha = '';
  for (let i = 0; i < tamanho; i++) senha += alfabeto[bytes[i] % alfabeto.length];
  return senha;
}

async function main() {
  const [, , usuarioArg, ...flags] = process.argv;
  const confirmar = flags.includes('--confirmar') || usuarioArg === '--confirmar';
  const usuario = (usuarioArg && usuarioArg !== '--confirmar') ? usuarioArg : 'kirkdouglas_19';
  const emailInterno = `${usuario}@${DOMINIO_INTERNO}`;

  const existente = await admin.auth().getUserByEmail(emailInterno).catch(() => null);

  console.log(`Usuário: ${usuario}`);
  console.log(`E-mail interno: ${emailInterno}`);
  console.log(existente ? 'Já existe — a senha seria redefinida.' : 'Não existe — seria criado.');

  if (!confirmar) {
    console.log('\nSIMULAÇÃO — nada foi alterado. Rode de novo com --confirmar para aplicar.');
    process.exit(0);
  }

  const senha = gerarSenha();

  if (existente) {
    await admin.auth().updateUser(existente.uid, { password: senha, emailVerified: true, disabled: false });
  } else {
    await admin.auth().createUser({
      email: emailInterno, emailVerified: true, password: senha, displayName: 'Operador',
    });
  }

  console.log('\nOK.');
  console.log(`  usuário: ${usuario}`);
  console.log(`  senha (anote agora, não aparece de novo): ${senha}`);
  console.log('\nLembrete: esse e-mail interno precisa estar em ADMIN_EMAILS');
  console.log('(functions/.env.<projeto>) e a function precisa de redeploy.');
  process.exit(0);
}

main().catch((err) => { console.error('Falha:', err.message); process.exit(1); });
