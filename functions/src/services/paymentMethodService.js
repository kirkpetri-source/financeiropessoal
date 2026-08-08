/**
 * Formas de pagamento — mesma lógica das categorias: as padrão são globais e
 * imutáveis, as personalizadas pertencem à família.
 *
 * `isCreditCard` + `closingDay`/`dueDay` existem para a fatura de cartão
 * (invoiceService.js): sem eles um cartão é só um rótulo, com eles vira o
 * ciclo que agrupa os lançamentos numa fatura de verdade.
 */

async function listPaymentMethods(dados) {
  const [snapPadrao, snapDaFamilia] = await Promise.all([
    dados.consultarPadroes('paymentMethods').get(),
    dados.consultar('paymentMethods').get(),
  ]);

  const padrao = snapPadrao.docs.map((d) => ({ id: d.id, ...d.data() }));
  const daFamilia = snapDaFamilia.docs.map((d) => ({ id: d.id, ...d.data() }));

  return [...padrao, ...daFamilia].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

async function createPaymentMethod(dados, entrada) {
  const isCreditCard = !!entrada.isCreditCard;
  return dados.criar('paymentMethods', {
    isDefault: false,
    name: entrada.name,
    isCreditCard,
    closingDay: isCreditCard ? entrada.closingDay ?? null : null,
    dueDay: isCreditCard ? entrada.dueDay ?? null : null,
  });
}

async function updatePaymentMethod(dados, id, entrada) {
  const atual = await dados.buscarDoc('paymentMethods', id);
  if (!atual) throw Object.assign(new Error('Forma de pagamento não encontrada.'), { statusCode: 404 });
  if (atual._somenteLeitura) {
    throw Object.assign(new Error('Forma de pagamento padrão não pode ser editada.'), { statusCode: 403 });
  }

  const alteracao = {};
  if (entrada.name !== undefined) alteracao.name = entrada.name;
  // Fechamento/vencimento só têm efeito em cartão de crédito — não dá para
  // ligar isCreditCard aqui (é decidido só na criação, para não transformar
  // uma forma já em uso, com faturas ou não, em cartão pela metade).
  if (atual.isCreditCard) {
    if (entrada.closingDay !== undefined) alteracao.closingDay = entrada.closingDay;
    if (entrada.dueDay !== undefined) alteracao.dueDay = entrada.dueDay;
  }

  return dados.atualizar('paymentMethods', id, alteracao);
}

async function deletePaymentMethod(dados, id) {
  const atual = await dados.buscarDoc('paymentMethods', id);
  if (!atual) throw Object.assign(new Error('Forma de pagamento não encontrada.'), { statusCode: 404 });
  if (atual._somenteLeitura) {
    throw Object.assign(new Error('Forma de pagamento padrão não pode ser excluída.'), { statusCode: 403 });
  }

  const emUso = await dados.consultar('transactions')
    .where('paymentMethodId', '==', id).limit(1).get();

  if (!emUso.empty) {
    throw Object.assign(new Error('Forma de pagamento em uso.'), { statusCode: 409 });
  }

  await dados.remover('paymentMethods', id);
}

module.exports = { listPaymentMethods, createPaymentMethod, updatePaymentMethod, deletePaymentMethod };
