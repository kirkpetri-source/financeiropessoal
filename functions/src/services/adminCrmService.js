/**
 * Notas do operador sobre uma família — "ligou reclamando de X", "pediu
 * desconto", "vai cancelar se não resolver Y". Cross-tenant por natureza
 * (só o operador lê/escreve, nunca a própria família), mesma exceção já
 * documentada em routes/admin.js — por isso fica fora de `escopoDe` e numa
 * coleção própria (`adminNotes`), nunca dentro de `households/{id}`.
 *
 * Sem orderBy na query por família, mesmo motivo do adminAuditService: coleção
 * pequena por família, `where` + `orderBy` em campos diferentes pede índice
 * composto que não existe aqui — ordena em memória.
 */

function criarServicoDeCrm({ db, admin }) {
  async function listarNotas(householdId, limite = 100) {
    const snap = await db.collection('adminNotes')
      .where('householdId', '==', householdId)
      .get();

    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .slice(0, limite)
      .map((n) => ({ ...n, createdAt: n.createdAt?.toDate?.()?.toISOString() || null }));
  }

  async function adicionarNota(householdId, { texto, criadoPor }) {
    const limpo = String(texto || '').trim();
    if (!limpo) {
      throw Object.assign(new Error('Nota vazia.'), { statusCode: 400 });
    }

    const ref = await db.collection('adminNotes').add({
      householdId,
      texto: limpo,
      criadoPor,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const doc = await ref.get();
    return { id: doc.id, ...doc.data(), createdAt: new Date().toISOString() };
  }

  async function apagarNota(householdId, notaId) {
    const ref = db.collection('adminNotes').doc(notaId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().householdId !== householdId) {
      throw Object.assign(new Error('Nota não encontrada.'), { statusCode: 404 });
    }
    await ref.delete();
    return { apagada: true };
  }

  return { listarNotas, adicionarNota, apagarNota };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { admin, db } = require('../config/firebaseAdmin');
    _padrao = criarServicoDeCrm({ db, admin });
  }
  return _padrao;
}

module.exports = {
  criarServicoDeCrm,
  servico,
  listarNotas: (...args) => servico().listarNotas(...args),
  adicionarNota: (...args) => servico().adicionarNota(...args),
  apagarNota: (...args) => servico().apagarNota(...args),
};
