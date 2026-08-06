/**
 * Acesso ao painel de operação (MRR, churn, famílias).
 *
 * Duas portas, as duas fechadas por padrão:
 *   - custom claim `admin: true` no token do Firebase (caminho definitivo);
 *   - `ADMIN_EMAILS` no ambiente, lista separada por vírgula (caminho de hoje,
 *     enquanto não há script de claims).
 *
 * Sem nenhuma das duas configuradas, ninguém entra — nem o Kirk. Painel que
 * mostra faturamento e contagem de clientes não pode ter default permissivo.
 *
 * O e-mail só vale quando verificado: e-mail não verificado é texto que o
 * usuário escolheu, e daria para criar uma conta com o e-mail do admin.
 */

function emailsAutorizados() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function apenasAdmin(req, res, next) {
  const email = (req.userEmail || '').toLowerCase();
  const lista = emailsAutorizados();

  const porClaim = req.userClaims?.admin === true;
  const porEmail = !!email && req.userEmailVerificado && lista.includes(email);

  if (porClaim || porEmail) return next();

  console.warn(`[Admin] Acesso negado a ${req.userId} (${email || 'sem e-mail'}).`);
  return res.status(403).json({ error: 'Acesso restrito.', codigo: 'NAO_E_ADMIN' });
}

module.exports = { apenasAdmin, emailsAutorizados };
