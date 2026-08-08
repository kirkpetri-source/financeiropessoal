const invoiceService = require('../services/invoiceService');

async function aberta(req, res, next) {
  try {
    const pm = await req.dados.buscarDoc('paymentMethods', req.query.paymentMethodId);
    if (!pm || !pm.isCreditCard) {
      return res.status(404).json({ error: 'Cartão de crédito não encontrado.' });
    }
    if (!pm.closingDay || !pm.dueDay) {
      return res.status(409).json({ error: 'Configure o dia de fechamento e vencimento deste cartão primeiro.' });
    }
    res.json(await invoiceService.resumoFaturaAberta(req.dados, pm));
  } catch (err) { next(err); }
}

async function historico(req, res, next) {
  try {
    res.json(await invoiceService.historico(req.dados, req.query.paymentMethodId));
  } catch (err) { next(err); }
}

async function pagar(req, res, next) {
  try {
    res.json(await invoiceService.marcarComoPaga(req.dados, req.params.id));
  } catch (err) { next(err); }
}

module.exports = { aberta, historico, pagar };
