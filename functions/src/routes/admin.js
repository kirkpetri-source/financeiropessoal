const express = require('express');
const { z } = require('zod');
const { db } = require('../config/firebaseAdmin');
const authMiddleware = require('../middlewares/auth');
const { apenasAdmin } = require('../middlewares/admin');
const { resumirFamilias } = require('../assinatura/metricas');
const { situacaoDaAssinatura } = require('../assinatura/estado');
const householdService = require('../services/householdService');
const assinaturaService = require('../services/assinaturaService');
const adminAuditService = require('../services/adminAuditService');
const validate = require('../middlewares/validate');

const router = express.Router();

// Sem resolverHousehold: o painel é do operador do SaaS e olha todas as
// famílias. Isso é exatamente o oposto do isolamento por tenant, então fica
// atrás do apenasAdmin e em rota separada, para ser visível na revisão.
//
// Montada em /plataforma (ver app.js), acessada só pelo login dedicado do
// operador (tools/criar-login-operador.js) — sem relação com nenhuma conta
// de família. A proteção de verdade continua sendo o apenasAdmin logo
// abaixo: sem custom claim nem ADMIN_EMAILS configurado, ninguém entra.
router.use(authMiddleware, apenasAdmin);

async function carregarFamilias() {
  const snap = await db.collection('households').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function carregarFamilia(id) {
  const doc = await db.collection('households').doc(id).get();
  if (!doc.exists) throw Object.assign(new Error('Família não encontrada.'), { statusCode: 404 });
  return { id: doc.id, ...doc.data() };
}

function quemFezIsso(req) {
  return req.userEmail || req.userId;
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

    // Nome da família é escolhido livremente pelo cliente (duas famílias podem
    // se chamar igual, sem conflito nenhum — o isolamento é pelo householdId).
    // Pra não confundir na hora de gerir, a lista traz também quem é o dono
    // (nome + telefone cadastrados), buscado da subcoleção de membros.
    const membrosPorFamilia = await Promise.all(
      familias.map((f) => householdService.listarMembros(f.id).catch(() => [])),
    );

    const lista = familias.map((f, i) => {
      const situacao = situacaoDaAssinatura(f.subscription, agora);
      const dono = membrosPorFamilia[i].find((m) => m.id === f.ownerId)
        || membrosPorFamilia[i].find((m) => m.role === 'owner');

      return {
        id: f.id,
        nome: f.name || null,
        donoNome: dono?.name || null,
        donoTelefone: dono?.phone || null,
        donoEmail: dono?.email || null,
        criadaEm: f.createdAt?.toDate?.()?.toISOString() || null,
        status: f.subscription?.status || null,
        provedor: f.subscription?.provider || null,
        plano: f.subscription?.plan || null,
        precoCentavos: f.subscription?.priceCents ?? null,
        podeLancar: situacao.podeLancar,
        emTrial: situacao.emTrial,
        emCarencia: situacao.emCarencia,
        bloqueadaPeloOperador: !!f.subscription?.adminOverride?.blocked,
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

/** Drill-down de uma família: assinatura, cobrança, membros e o que o painel já mudou nela. */
router.get('/familias/:id', async (req, res, next) => {
  try {
    const familia = await carregarFamilia(req.params.id);
    const situacao = situacaoDaAssinatura(familia.subscription, new Date());

    const [membros, eventos, auditoria] = await Promise.all([
      householdService.listarMembros(familia.id),
      assinaturaService.listarEventos(familia.id),
      adminAuditService.listarPorFamilia(familia.id),
    ]);

    res.json({
      id: familia.id,
      nome: familia.name || null,
      criadaEm: familia.createdAt?.toDate?.()?.toISOString() || null,
      subscription: familia.subscription || null,
      situacao: { ...situacao, expiraEm: situacao.expiraEm?.toISOString() || null },
      deletion: familia.deletion || null,
      membros: membros.map((m) => ({ id: m.id, name: m.name, email: m.email, phone: m.phone, role: m.role })),
      billingEvents: eventos,
      auditoria,
    });
  } catch (err) { next(err); }
});

const motivoSchema = z.object({ motivo: z.string().max(300).optional().nullable() });
const pagamentoManualSchema = z.object({
  diasDeAcesso: z.number().int().positive().max(366).optional(),
  motivo: z.string().max(300).optional().nullable(),
});

/**
 * Registrar pagamento fora do fluxo do provedor (Pix direto, negociação).
 * É a exceção deliberada e auditada à regra de que só o provedor ativa uma
 * assinatura — ver o comentário em `assinaturaService.registrarPagamentoManual`.
 */
router.post('/familias/:id/pagamento-manual', validate(pagamentoManualSchema), async (req, res, next) => {
  try {
    const { diasDeAcesso = 30, motivo = null } = req.body;
    const resultado = await assinaturaService.registrarPagamentoManual(req.params.id, {
      diasDeAcesso, motivo, registradoPor: quemFezIsso(req),
    });
    await adminAuditService.registrar({
      adminUid: req.userId, adminEmail: req.userEmail, acao: 'pagamento_manual',
      householdId: req.params.id, detalhes: { diasDeAcesso, motivo },
    });
    res.json(resultado);
  } catch (err) { next(err); }
});

router.post('/familias/:id/marcar-interna', async (req, res, next) => {
  try {
    const resultado = await assinaturaService.marcarComoInterna(req.params.id, { registradoPor: quemFezIsso(req) });
    await adminAuditService.registrar({
      adminUid: req.userId, adminEmail: req.userEmail, acao: 'marcar_interna', householdId: req.params.id,
    });
    res.json(resultado);
  } catch (err) { next(err); }
});

router.post('/familias/:id/desmarcar-interna', async (req, res, next) => {
  try {
    const resultado = await assinaturaService.desmarcarInterna(req.params.id, { registradoPor: quemFezIsso(req) });
    await adminAuditService.registrar({
      adminUid: req.userId, adminEmail: req.userEmail, acao: 'desmarcar_interna', householdId: req.params.id,
    });
    res.json(resultado);
  } catch (err) { next(err); }
});

/** Confere a assinatura no provedor agora — mesmo efeito de `POST /subscription/sincronizar`, mas acionado pelo operador. */
router.post('/familias/:id/sincronizar', async (req, res, next) => {
  try {
    const familia = await carregarFamilia(req.params.id);
    const externalId = familia.subscription?.externalId;
    if (!externalId) {
      return res.status(409).json({ error: 'Esta família não tem assinatura no provedor para sincronizar.' });
    }

    await assinaturaService.sincronizarDoProvedor(externalId);
    await adminAuditService.registrar({
      adminUid: req.userId, adminEmail: req.userEmail, acao: 'sincronizar', householdId: req.params.id,
    });
    res.json(await assinaturaService.situacaoDaFamilia(req.params.id));
  } catch (err) { next(err); }
});

router.post('/familias/:id/cancelar', validate(motivoSchema), async (req, res, next) => {
  try {
    const resultado = await assinaturaService.cancelar(req.params.id, { motivo: req.body.motivo || null });
    await adminAuditService.registrar({
      adminUid: req.userId, adminEmail: req.userEmail, acao: 'cancelar', householdId: req.params.id,
      detalhes: { motivo: req.body.motivo || null },
    });
    res.json(resultado);
  } catch (err) { next(err); }
});

/** Bloqueio manual — abuso, fraude, ou pedido do próprio cliente por fora do fluxo normal. */
router.post('/familias/:id/bloquear', validate(motivoSchema), async (req, res, next) => {
  try {
    const resultado = await assinaturaService.bloquear(req.params.id, {
      motivo: req.body.motivo || null, registradoPor: quemFezIsso(req),
    });
    await adminAuditService.registrar({
      adminUid: req.userId, adminEmail: req.userEmail, acao: 'bloquear', householdId: req.params.id,
      detalhes: { motivo: req.body.motivo || null },
    });
    res.json(resultado);
  } catch (err) { next(err); }
});

router.post('/familias/:id/desbloquear', async (req, res, next) => {
  try {
    const resultado = await assinaturaService.desbloquear(req.params.id, { registradoPor: quemFezIsso(req) });
    await adminAuditService.registrar({
      adminUid: req.userId, adminEmail: req.userEmail, acao: 'desbloquear', householdId: req.params.id,
    });
    res.json(resultado);
  } catch (err) { next(err); }
});

module.exports = router;
