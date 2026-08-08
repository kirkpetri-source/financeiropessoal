const { admin, db } = require('../config/firebaseAdmin');

/**
 * Auditoria das ações do painel do operador — cross-tenant por natureza
 * (mesma exceção documentada de `routes/admin.js`), então fica fora de
 * `escopoDe`. Toda ação de escrita do painel admin (pagamento manual,
 * marcar/desmarcar interna, bloquear/desbloquear, cancelar, sincronizar)
 * grava aqui quem fez, o quê, em qual família e quando — é dinheiro e acesso
 * de cliente sendo mexido fora do fluxo normal de cobrança, então precisa de
 * rastro.
 */

async function registrar({ adminUid, adminEmail, acao, householdId, detalhes = null }) {
  await db.collection('adminAuditLog').add({
    adminUid,
    adminEmail,
    acao,
    householdId,
    detalhes,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function listarPorFamilia(householdId, limite = 50) {
  const snap = await db.collection('adminAuditLog')
    .where('householdId', '==', householdId)
    .orderBy('createdAt', 'desc')
    .limit(limite)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = { registrar, listarPorFamilia };
