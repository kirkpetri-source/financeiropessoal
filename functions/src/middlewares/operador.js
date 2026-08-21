/**
 * Quem pode ATENDER chamado de suporte.
 *
 * Não confundir com `apenasAdmin`, que continua guardando tudo que já existe no
 * `/plataforma` (métricas, faturamento, apagar família). Os dois convivem:
 *
 *   apenasAdmin          — dono do negócio. Vê dinheiro e mexe em conta.
 *   apenasOperadorAtivo  — quem trabalha no suporte. Vê e responde chamado.
 *
 * A separação existe porque a coleção `operadores` não faria sentido nenhum se
 * toda rota de atendimento continuasse atrás de `apenasAdmin`: contratar um
 * atendente significaria entregar o painel de faturamento junto. A matriz
 * completa de permissões é a etapa 2; aqui só se evita o acoplamento.
 *
 * Diferença prática para o `apenasAdmin`: quem é admin vem de `ADMIN_EMAILS` no
 * `.env`, então mudar a lista exige deploy. Operador vive no Firestore —
 * desligar alguém é uma escrita, e vale na requisição seguinte.
 *
 * ATENÇÃO À ORDEM DAS ROTAS em `app.js`. `routes/admin.js` faz
 * `router.use(authMiddleware, apenasAdmin)` no topo, e isso vale para tudo que
 * for registrado depois. A rota de chamados do operador precisa ser montada
 * ANTES de `/plataforma`, senão o Express manda a requisição para o router do
 * admin e todo atendente vira administrador — em silêncio, sem erro nenhum.
 */

const PAPEIS = { ADMIN: 'ADMIN', ATENDENTE: 'ATENDENTE' };

/**
 * `buscarOperador` entra por parâmetro (fábrica), mesmo motivo do padrão em
 * `auth.js` e `escopo.js`: importar `config/firebaseAdmin` direto arrastaria a
 * trava que recusa carregar sob VITEST. O teste injeta um dublê, nunca um mock
 * de módulo.
 */
function criarApenasOperadorAtivo(buscarOperador) {
  return async function apenasOperadorAtivo(req, res, next) {
    // Sem userId, o authMiddleware não rodou antes deste. Seguir daqui
    // consultaria `operadores/undefined` e a resposta certa é 401, não 403:
    // o problema é falta de identidade, não falta de permissão.
    if (!req.userId) {
      return res.status(401).json({
        error: 'Token de autenticação não fornecido.',
        codigo: 'SEM_AUTENTICACAO',
      });
    }

    let operador;
    try {
      // O uid vem do TOKEN, nunca do corpo ou da query. Aceitar de qualquer
      // outro lugar transformaria a autorização em campo de formulário.
      operador = await buscarOperador(req.userId);
    } catch (err) {
      // Banco fora do ar não pode virar liberação. Deixa o errorHandler
      // responder 500 — falhar fechado é o único comportamento aceitável aqui.
      return next(err);
    }

    if (!operador) {
      console.warn(`[Operador] Acesso negado a ${req.userId}: não é operador.`);
      return res.status(403).json({
        error: 'Acesso restrito à equipe de suporte.',
        codigo: 'NAO_E_OPERADOR',
      });
    }

    // `=== true` de propósito: registro sem o campo, com `null`, ou com a
    // string "true" NÃO passa. Documento meio preenchido é o caminho mais curto
    // para alguém atender sem nunca ter sido cadastrado de verdade.
    if (operador.ativo !== true) {
      console.warn(`[Operador] Acesso negado a ${req.userId}: operador inativo.`);
      return res.status(403).json({
        error: 'Seu acesso de operador está desativado.',
        codigo: 'OPERADOR_INATIVO',
      });
    }

    // Papel desconhecido cai em ATENDENTE, não em ADMIN. Um valor digitado
    // errado no banco não pode promover ninguém.
    const papel = Object.values(PAPEIS).includes(operador.papel)
      ? operador.papel
      : PAPEIS.ATENDENTE;

    // Só os quatro campos que o atendimento usa. Repassar o documento inteiro
    // levaria para a rota (e daí para o JSON de resposta, um dia) qualquer
    // campo que a coleção venha a ganhar.
    req.operador = {
      uid: req.userId,
      nome: operador.nome || null,
      papel,
      ativo: true,
    };

    return next();
  };
}

let _padrao = null;

function apenasOperadorAtivo(req, res, next) {
  if (!_padrao) {
    const { db } = require('../config/firebaseAdmin');
    _padrao = criarApenasOperadorAtivo(async (uid) => {
      const doc = await db.collection('operadores').doc(uid).get();
      return doc.exists ? doc.data() : null;
    });
  }
  return _padrao(req, res, next);
}

module.exports = apenasOperadorAtivo;
module.exports.criarApenasOperadorAtivo = criarApenasOperadorAtivo;
module.exports.apenasOperadorAtivo = apenasOperadorAtivo;
module.exports.PAPEIS = PAPEIS;
