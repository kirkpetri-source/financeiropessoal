const { admin, db } = require('../config/firebaseAdmin');

/**
 * Registro das mensagens recebidas pelo WhatsApp.
 *
 * A listagem pagina no Firestore, não em memória. A versão anterior baixava a
 * coleção inteira da família a cada abertura da tela e recortava depois — com
 * o polling rodando de 2 em 2 minutos, essa coleção só cresce, e a cada mês a
 * tela ficava mais cara e mais lenta.
 */

async function listLogs(dados, filtros = {}) {
  const { status, messageType } = filtros;
  const limite = Math.min(Number(filtros.limit) || 50, 200);

  let query = dados.consultar('whatsappLogs');

  // Filtros que o Firestore resolve com índice
  if (status) query = query.where('processingStatus', '==', status);
  if (messageType) query = query.where('messageType', '==', messageType);

  const snap = await query.orderBy('createdAt', 'desc').limit(limite).get();

  const logs = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate?.() || null,
  }));

  const enriquecidos = await enriquecerComTransacao(logs);

  return { logs: enriquecidos, total: enriquecidos.length, limite };
}

async function enriquecerComTransacao(logs) {
  const ids = [...new Set(logs.map((l) => l.transactionId).filter(Boolean))];
  if (!ids.length) return logs.map((l) => ({ ...l, transaction: null }));

  const docs = await db.getAll(...ids.map((id) => db.collection('transactions').doc(id)));

  const porId = {};
  docs.forEach((doc) => {
    if (!doc.exists) return;
    const t = doc.data();
    porId[doc.id] = { id: doc.id, description: t.description, amount: t.amount, type: t.type };
  });

  return logs.map((l) => ({ ...l, transaction: porId[l.transactionId] || null }));
}

async function createLog(dados, entrada) {
  return dados.criar('whatsappLogs', entrada);
}

async function updateLog(logId, entrada) {
  await db.collection('whatsappLogs').doc(logId).update(entrada);
}

/**
 * Cancela o lançamento gerado por uma mensagem.
 *
 * O log NÃO é apagado de propósito: ele é a marca de que aquela mensagem já foi
 * processada. Apagando, o polling reencontraria a mesma mensagem no histórico
 * do WhatsApp e criaria o lançamento de novo.
 */
async function deleteLog(dados, logId) {
  const log = await dados.buscarDoc('whatsappLogs', logId);
  if (!log) throw Object.assign(new Error('Log não encontrado.'), { statusCode: 404 });

  const transactionId = log.transactionId;

  await Promise.all([
    dados.atualizar('whatsappLogs', logId, {
      processingStatus: 'CANCELLED',
      transactionId: null,
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    }),
    transactionId
      ? dados.remover('transactions', transactionId).catch((err) => {
          // O lançamento pode já ter sido excluído pela tela de Lançamentos.
          if (err.statusCode !== 404) throw err;
        })
      : Promise.resolve(),
  ]);
}

module.exports = { listLogs, createLog, updateLog, deleteLog };
