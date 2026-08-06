const express = require('express');
const { db } = require('../config/firebaseAdmin');
const authMiddleware = require('../middlewares/auth');
const { apenasAdmin } = require('../middlewares/admin');
const { resumirFamilias } = require('../assinatura/metricas');
const { situacaoDaAssinatura } = require('../assinatura/estado');

const router = express.Router();

// Sem resolverHousehold: o painel é do operador do SaaS e olha todas as
// famílias. Isso é exatamente o oposto do isolamento por tenant, então fica
// atrás do apenasAdmin e em rota separada, para ser visível na revisão.
router.use(authMiddleware, apenasAdmin);

async function carregarFamilias() {
  const snap = await db.collection('households').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

router.get('/metricas', async (req, res, next) => {
  try {
    const janela = Number(req.query.janelaDias) || 30;
    const familias = await carregarFamilias();
    res.json({
      geradoEm: new Date().toISOString(),
      ...resumirFamilias(familias, new Date(), janela),
    });
  } catch (err) { next(err); }
});

/**
 * Lista de famílias para operação — quem está prestes a vencer, quem está
 * atrasado, quem pediu exclusão. Sem nenhum lançamento: o painel de operação
 * não precisa ver o extrato de ninguém, e não vê.
 */
router.get('/familias', async (req, res, next) => {
  try {
    const agora = new Date();
    const familias = await carregarFamilias();

    const lista = familias.map((f) => {
      const situacao = situacaoDaAssinatura(f.subscription, agora);
      return {
        id: f.id,
        nome: f.name || null,
        criadaEm: f.createdAt?.toDate?.()?.toISOString() || null,
        status: f.subscription?.status || null,
        provedor: f.subscription?.provider || null,
        precoCentavos: f.subscription?.priceCents ?? null,
        podeLancar: situacao.podeLancar,
        emTrial: situacao.emTrial,
        emCarencia: situacao.emCarencia,
        motivo: situacao.motivo,
        expiraEm: situacao.expiraEm?.toISOString() || null,
        diasRestantes: situacao.diasRestantes,
        exclusaoAgendadaPara: f.deletion?.scheduledFor?.toDate?.()?.toISOString() || null,
      };
    });

    // Quem está mais perto de sair primeiro: é a fila de quem precisa de contato.
    lista.sort((a, b) => (a.diasRestantes ?? 9999) - (b.diasRestantes ?? 9999));

    res.json({ total: lista.length, familias: lista });
  } catch (err) { next(err); }
});

module.exports = router;
