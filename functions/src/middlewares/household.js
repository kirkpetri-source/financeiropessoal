const { db } = require('../config/firebaseAdmin');
const { escopoDe } = require('../data/escopo');
const householdService = require('../services/householdService');
const { situacaoDaAssinatura, mensagemDaSituacao } = require('../assinatura/estado');

/**
 * Resolve a família do usuário autenticado e prepara o escopo de dados.
 *
 * Roda depois do authMiddleware e deixa em req:
 *   req.householdId   família ativa
 *   req.household     documento da família (inclui a assinatura)
 *   req.papel         papel do usuário nessa família
 *   req.permissoes    o que ele pode fazer
 *   req.assinatura    situação da assinatura, já calculada
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

    const [papel, householdDoc] = await Promise.all([
      householdService.papelDoUsuario(householdId, req.userId),
      db.collection('households').doc(householdId).get(),
    ]);

    if (!papel) {
      // O atalho aponta para uma família da qual ele não é (ou não é mais) membro.
      console.warn(`[Household] Usuário ${req.userId} aponta para ${householdId} sem ser membro.`);
      return res.status(403).json({
        error: 'Você não faz parte dessa família.',
        codigo: 'NAO_E_MEMBRO',
      });
    }

    req.householdId = householdId;
    req.household = householdDoc.exists ? { id: householdDoc.id, ...householdDoc.data() } : null;
    req.papel = papel;
    req.permissoes = householdService.permissoesDoPapel(papel);
    req.assinatura = situacaoDaAssinatura(req.household?.subscription, new Date());
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

/**
 * Exige assinatura em dia (ou trial vigente) para gravar.
 *
 * Aplicado só em escrita, nunca em leitura. Quem parou de pagar continua
 * enxergando e exportando todo o histórico — o que ele perde é o direito de
 * lançar coisa nova. Bloquear a leitura seria segurar dado financeiro de
 * família como refém, o que é ruim de produto e frágil na LGPD.
 *
 * Uso: router.post('/', exigirAssinatura, exigir('lancar'), ...)
 */
function exigirAssinatura(req, res, next) {
  // Conta com exclusão pedida fica congelada durante o prazo de arrependimento.
  // Continua lendo e exportando (é justamente o que ela precisa fazer antes de
  // sumir), mas não aceita lançamento novo — dado criado no dia 6 de um prazo
  // de 7 dias seria apagado no dia seguinte.
  if (req.household?.deletion) {
    return res.status(423).json({
      error: 'Esta conta está com exclusão agendada. Cancele a exclusão para voltar a lançar.',
      codigo: 'EXCLUSAO_AGENDADA',
      agendadaPara: req.household.deletion.scheduledFor?.toDate?.().toISOString() || null,
    });
  }

  if (req.assinatura?.podeLancar) return next();

  const situacao = req.assinatura || {};
  return res.status(402).json({
    error: mensagemDaSituacao(situacao),
    codigo: 'ASSINATURA_INATIVA',
    motivo: situacao.motivo || 'SEM_ASSINATURA',
    expiraEm: situacao.expiraEm ? situacao.expiraEm.toISOString() : null,
  });
}

module.exports = { resolverHousehold, exigir, exigirAssinatura };
