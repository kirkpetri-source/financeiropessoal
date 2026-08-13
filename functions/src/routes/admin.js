const express = require('express');
const { z } = require('zod');
const { db } = require('../config/firebaseAdmin');
const authMiddleware = require('../middlewares/auth');
const { apenasAdmin } = require('../middlewares/admin');
const { resumirFamilias, serieTemporal } = require('../assinatura/metricas');
const { situacaoDaAssinatura } = require('../assinatura/estado');
const { SEGMENTOS, filtrarPorSegmento, contarSegmentos } = require('../assinatura/segmentacao');
const householdService = require('../services/householdService');
const assinaturaService = require('../services/assinaturaService');
const adminAuditService = require('../services/adminAuditService');
const adminCrmService = require('../services/adminCrmService');
const adminMensagensService = require('../services/adminMensagensService');
const whatsappLogService = require('../services/whatsappLogService');
const lgpdService = require('../services/lgpdService');
const validate = require('../middlewares/validate');
const { escopoDe } = require('../data/escopo');

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
 * Série diária (crescimento, cancelamentos, MRR projetado) para os gráficos
 * do dashboard — ver o comentário de `serieTemporal` sobre ser uma projeção,
 * não um snapshot histórico real.
 */
router.get('/metricas/serie', async (req, res, next) => {
  try {
    const dias = Math.min(Math.max(Number(req.query.dias) || 90, 7), 365);
    const familias = await carregarFamilias();
    res.json({ dias, serie: serieTemporal(familias, new Date(), dias) });
  } catch (err) { next(err); }
});

/** Quantas famílias caem em cada segmento — a UI mostra isso antes de mandar um broadcast. */
router.get('/segmentos', async (req, res, next) => {
  try {
    const familias = await carregarFamilias();
    res.json({ segmentos: contarSegmentos(familias, new Date()) });
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

/** Notas do CRM sobre a família — "ligou reclamando de X", "vai cancelar se Y". */
router.get('/familias/:id/notas', async (req, res, next) => {
  try {
    res.json({ notas: await adminCrmService.listarNotas(req.params.id) });
  } catch (err) { next(err); }
});

const notaSchema = z.object({ texto: z.string().min(1).max(2000) });

router.post('/familias/:id/notas', validate(notaSchema), async (req, res, next) => {
  try {
    const nota = await adminCrmService.adicionarNota(req.params.id, {
      texto: req.body.texto, criadoPor: quemFezIsso(req),
    });
    res.status(201).json(nota);
  } catch (err) { next(err); }
});

router.delete('/familias/:id/notas/:notaId', async (req, res, next) => {
  try {
    res.json(await adminCrmService.apagarNota(req.params.id, req.params.notaId));
  } catch (err) { next(err); }
});

/**
 * Histórico de mensagens do WhatsApp da família (o mesmo log que já existe
 * para o próprio cliente ver no painel dele) — reaproveita
 * `whatsappLogService.listLogs`, só entrando pelo escopo certo (o operador
 * não tem `req.dados` porque não passa por `resolverHousehold`).
 */
router.get('/familias/:id/mensagens', async (req, res, next) => {
  try {
    const dados = escopoDe(req.params.id);
    res.json(await whatsappLogService.listLogs(dados, { limit: req.query.limit || 100 }));
  } catch (err) { next(err); }
});

/** Envio avulso de mensagem pra UMA família — mesma trilha do broadcast, registrado com 1 destinatário. */
const mensagemAvulsaSchema = z.object({ texto: z.string().min(1).max(4000) });
router.post('/familias/:id/enviar-mensagem', validate(mensagemAvulsaSchema), async (req, res, next) => {
  try {
    const resultado = await adminMensagensService.enviarParaFamilia({
      householdId: req.params.id, texto: req.body.texto, criadoPor: quemFezIsso(req),
    });
    res.json(resultado);
  } catch (err) { next(err); }
});

/** Templates reutilizáveis (avisos, novidades, dicas, atualizações). */
router.get('/mensagens/templates', async (req, res, next) => {
  try {
    res.json({ templates: await adminMensagensService.listarTemplates() });
  } catch (err) { next(err); }
});

const templateSchema = z.object({
  titulo: z.string().min(1).max(120),
  tipo: z.enum(['aviso', 'novidade', 'dica', 'atualizacao']),
  texto: z.string().min(1).max(4000),
});

router.post('/mensagens/templates', validate(templateSchema), async (req, res, next) => {
  try {
    const template = await adminMensagensService.salvarTemplate({ ...req.body, criadoPor: quemFezIsso(req) });
    res.status(201).json(template);
  } catch (err) { next(err); }
});

router.put('/mensagens/templates/:id', validate(templateSchema), async (req, res, next) => {
  try {
    res.json(await adminMensagensService.salvarTemplate({ id: req.params.id, ...req.body }));
  } catch (err) { next(err); }
});

router.delete('/mensagens/templates/:id', async (req, res, next) => {
  try {
    res.json(await adminMensagensService.apagarTemplate(req.params.id));
  } catch (err) { next(err); }
});

/**
 * Broadcast — segmento de famílias (ou lista explícita de IDs) recebe a
 * mesma mensagem pelo WhatsApp. `segmento` e `householdIds` são mutuamente
 * exclusivos: `householdIds` vence quando os dois vierem, pra permitir
 * "reenviar só pra quem falhou" a partir do resultado de um broadcast
 * anterior sem precisar recalcular o segmento.
 */
const broadcastSchema = z.object({
  texto: z.string().min(1).max(4000),
  tipo: z.enum(['aviso', 'novidade', 'dica', 'atualizacao']).default('aviso'),
  assunto: z.string().max(120).optional().nullable(),
  segmento: z.enum(SEGMENTOS.map((s) => s.chave)).optional(),
  householdIds: z.array(z.string().min(1)).max(500).optional(),
}).refine((v) => v.segmento || (v.householdIds && v.householdIds.length > 0), {
  message: 'Informe um segmento ou uma lista de famílias.',
});

router.post('/mensagens/broadcast', validate(broadcastSchema), async (req, res, next) => {
  try {
    const { texto, tipo, assunto, segmento, householdIds } = req.body;
    const todasFamilias = await carregarFamilias();

    const alvo = householdIds?.length
      ? todasFamilias.filter((f) => householdIds.includes(f.id))
      : filtrarPorSegmento(todasFamilias, segmento, new Date());

    const resultado = await adminMensagensService.enviarBroadcast({
      familias: alvo,
      texto,
      tipo,
      assunto: assunto || null,
      segmento: householdIds?.length ? null : segmento,
      criadoPor: quemFezIsso(req),
    });

    res.status(201).json(resultado);
  } catch (err) { next(err); }
});

router.get('/mensagens/historico', async (req, res, next) => {
  try {
    res.json({ broadcasts: await adminMensagensService.listarBroadcasts(Number(req.query.limit) || 30) });
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

const apagarAgoraSchema = z.object({
  confirmarNome: z.string().min(1, 'Digite o nome da família para confirmar.'),
  motivo: z.string().max(300).optional().nullable(),
});

/**
 * Apaga a família AGORA, sem o prazo de arrependimento de 7 dias do fluxo de
 * LGPD do cliente — caminho do OPERADOR para limpar conta de teste entre uma
 * rodada de teste ponta a ponta e outra. Irreversível: sem "desfazer", sem
 * congelamento antes. Por isso a segunda trava aqui: o nome da família
 * digitado pelo operador precisa bater com o nome de verdade (a UI já exige
 * isso antes de habilitar o botão; o backend confere de novo).
 */
router.post('/familias/:id/apagar-agora', validate(apagarAgoraSchema), async (req, res, next) => {
  try {
    const familia = await carregarFamilia(req.params.id);

    // Espelha o fallback do frontend: família sem nome (não deveria acontecer)
    // exige a palavra fixa "APAGAR" em vez de deixar um campo vazio confirmar
    // um nome vazio.
    const alvo = (familia.name || '').trim() || 'APAGAR';
    if (req.body.confirmarNome !== alvo) {
      throw Object.assign(
        new Error('O nome digitado não confere com o nome da família. Nada foi apagado.'),
        { statusCode: 409, codigo: 'CONFIRMACAO_NAO_CONFERE' },
      );
    }

    const { servidor, servidorConfigurado } = require('../config/evolutionServidor');
    const provider = require('../canais/evolutionProvider');
    const evolutionConfig = servidorConfigurado()
      ? (({ url, apiKey }) => ({ evolutionApiUrl: url, apiKey }))(servidor())
      : null;

    const resultado = await lgpdService.apagarFamiliaAgora(req.params.id, { provider, evolutionConfig });

    // Auditoria gravada ANTES da família sumir da lista — householdId aqui
    // fica órfão de propósito (a família não existe mais), é só o rastro de
    // que a exclusão aconteceu, quem fez e por quê.
    await adminAuditService.registrar({
      adminUid: req.userId, adminEmail: req.userEmail, acao: 'apagar_agora',
      householdId: req.params.id,
      detalhes: { nome: resultado.nome, motivo: req.body.motivo || null, contagem: resultado.contagem },
    });

    res.json({ apagada: true, ...resultado });
  } catch (err) { next(err); }
});

module.exports = router;
