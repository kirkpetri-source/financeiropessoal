const express = require('express');
const { z } = require('zod');
const authMiddleware = require('../middlewares/auth');
const { resolverHousehold, exigir } = require('../middlewares/household');
const validate = require('../middlewares/validate');
const assinaturaService = require('../services/assinaturaService');
const { PRECO_MENSAL_CENTAVOS, DIAS_DE_TRIAL } = require('../assinatura/estado');

const router = express.Router();

const checkoutSchema = z.object({
  // Opcional: por padrão cobra no e-mail de quem está logado. Existe porque
  // quem paga nem sempre é quem administra a conta.
  email: z.string().email('E-mail inválido.').optional(),
});

const cancelamentoSchema = z.object({
  motivo: z.string().max(300).optional().nullable(),
});

// A URL para onde o Mercado Pago devolve o cliente depois de autorizar.
// O padrão é o domínio de produção; APP_URL sobrescreve (ambiente de teste,
// domínio próprio). Errar aqui manda quem acabou de pagar para uma página que
// não existe, então o valor vive em functions/.env.<projeto>.
function urlDeRetorno() {
  const base = process.env.APP_URL || 'https://financeiropessoal-tau.vercel.app';
  return `${base.replace(/\/$/, '')}/assinatura?retorno=1`;
}

router.use(authMiddleware, resolverHousehold);

/** Situação atual — é o que o banner e a tela de bloqueio consomem. */
router.get('/', async (req, res, next) => {
  try {
    res.json({
      ...assinaturaService.montarSituacao(req.household),
      precoMensalCentavos: PRECO_MENSAL_CENTAVOS,
      diasDeTrial: DIAS_DE_TRIAL,
      podeGerir: !!req.permissoes?.gerirAssinatura,
    });
  } catch (err) { next(err); }
});

/**
 * Abre o checkout e devolve o link do Mercado Pago.
 * Só o dono paga: liberar para membro criaria cobrança no cartão de quem não
 * decide sobre a conta.
 */
router.post('/checkout', exigir('gerirAssinatura'), validate(checkoutSchema), async (req, res, next) => {
  try {
    const email = req.body.email || req.userEmail;
    if (!email) {
      return res.status(400).json({ error: 'Informe o e-mail para a cobrança.' });
    }

    const resultado = await assinaturaService.iniciarCheckout(req.householdId, {
      email,
      urlDeRetorno: urlDeRetorno(),
    });

    res.status(201).json(resultado);
  } catch (err) { next(err); }
});

/**
 * Confere a assinatura no provedor agora. O cliente volta do checkout antes do
 * webhook chegar; sem isso ele veria "aguardando pagamento" numa assinatura já
 * autorizada e acharia que o pagamento falhou.
 */
router.post('/sincronizar', exigir('gerirAssinatura'), async (req, res, next) => {
  try {
    const externalId = req.household?.subscription?.externalId;
    if (!externalId) {
      return res.status(409).json({ error: 'Nenhuma assinatura para sincronizar.', codigo: 'SEM_ASSINATURA' });
    }

    await assinaturaService.sincronizarDoProvedor(externalId);
    res.json(await assinaturaService.situacaoDaFamilia(req.householdId));
  } catch (err) { next(err); }
});

router.post('/cancelar', exigir('gerirAssinatura'), validate(cancelamentoSchema), async (req, res, next) => {
  try {
    res.json(await assinaturaService.cancelar(req.householdId, { motivo: req.body.motivo || null }));
  } catch (err) { next(err); }
});

/** Histórico de cobrança da família — checkout, pagamentos e cancelamentos. */
router.get('/eventos', exigir('gerirAssinatura'), async (req, res, next) => {
  try {
    res.json(await assinaturaService.listarEventos(req.householdId));
  } catch (err) { next(err); }
});

module.exports = router;
