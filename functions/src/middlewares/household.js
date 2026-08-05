const { db } = require('../config/firebaseAdmin');
const { escopoDe } = require('../data/escopo');
const householdService = require('../services/householdService');

/**
 * Resolve a família do usuário autenticado e prepara o escopo de dados.
 *
 * Roda depois do authMiddleware e deixa em req:
 *   req.householdId   família ativa
 *   req.papel         papel do usuário nessa família
 *   req.permissoes    o que ele pode fazer
 *   req.dados         acessor com o tenant já travado
 *
 * A confirmação de que o usuário pertence à família vem da subcoleção de
 * membros, não do campo users/{uid}.householdId. O campo é só um atalho de
 * "última família usada"; adulterá-lo não dá acesso a nada, porque quem manda
 * é a existência do documento em households/{id}/members/{uid}.
 */
async function resolverHousehold(req, res, next) {
  try {
    const userDoc = await db.collection('users').doc(req.userId).get();
    const householdId = userDoc.exists ? userDoc.data().householdId : null;

    if (!householdId) {
      return res.status(409).json({
        error: 'Você ainda não tem uma família configurada.',
        codigo: 'SEM_HOUSEHOLD',
      });
    }

    const papel = await householdService.papelDoUsuario(householdId, req.userId);

    if (!papel) {
      // O atalho aponta para uma família da qual ele não é (ou não é mais) membro.
      console.warn(`[Household] Usuário ${req.userId} aponta para ${householdId} sem ser membro.`);
      return res.status(403).json({
        error: 'Você não faz parte dessa família.',
        codigo: 'NAO_E_MEMBRO',
      });
    }

    req.householdId = householdId;
    req.papel = papel;
    req.permissoes = householdService.permissoesDoPapel(papel);
    req.dados = escopoDe(householdId);

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Exige uma permissão específica. Uso: router.post('/', exigir('lancar'), ...)
 */
function exigir(permissao) {
  return (req, res, next) => {
    if (!req.permissoes?.[permissao]) {
      return res.status(403).json({
        error: 'Seu perfil nessa família não permite essa ação.',
        codigo: 'SEM_PERMISSAO',
      });
    }
    next();
  };
}

module.exports = { resolverHousehold, exigir };
