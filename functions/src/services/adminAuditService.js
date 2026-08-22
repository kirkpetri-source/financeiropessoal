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

/**
 * Sem orderBy na query de propósito: `where` + `orderBy` em campos
 * diferentes exige índice composto no Firestore, e essa coleção é
 * pequena por família (poucas ações administrativas por vez) — ordenar em
 * memória evita gerenciar um índice só por causa desta tela. Foi assim
 * que a primeira versão quebrou em produção: FAILED_PRECONDITION por
 * falta do índice, sem nenhum teste local acusando (o dublê de Firestore
 * dos testes não reproduz essa exigência).
 */
async function listarPorFamilia(householdId, limite = 50) {
  const snap = await db.collection('adminAuditLog')
    .where('householdId', '==', householdId)
    .get();

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    .slice(0, limite)
    // Timestamp do Firestore não sobrevive ao JSON.stringify do res.json
    // como objeto usável — vira {_seconds,...} e o formatDate do frontend
    // não entende. Converte pra ISO aqui, igual todo outro campo de data
    // que sai desta rota.
    .map((a) => ({ ...a, createdAt: a.createdAt?.toDate?.()?.toISOString() || null }));
}

/**
 * As ações mais recentes de TODAS as famílias — o log que o painel mostra.
 *
 * `orderBy` sozinho, sem `where`, NÃO exige índice composto (regra 12): é a
 * ordenação natural de um campo só. O `where` é que forçaria o índice, e por
 * isso o filtro por ação é aplicado em memória, sobre uma janela já limitada.
 *
 * `acoes` filtra por tipo — a tela de backup só quer ver backup e restauração,
 * não pagamento manual de assinatura.
 */
async function listarRecentes({ acoes = null, limite = 50 } = {}) {
  const janela = acoes ? Math.max(limite * 6, 200) : limite;

  const snap = await db.collection('adminAuditLog')
    .orderBy('createdAt', 'desc')
    .limit(janela)
    .get();

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => !acoes || acoes.includes(a.acao))
    .slice(0, limite)
    .map((a) => ({ ...a, createdAt: a.createdAt?.toDate?.()?.toISOString() || null }));
}

module.exports = { registrar, listarPorFamilia, listarRecentes };
