/**
 * Formas de pagamento — mesma lógica das categorias: as padrão são globais e
 * imutáveis, as personalizadas pertencem à família.
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

async function createPaymentMethod(dados, name) {
  return dados.criar('paymentMethods', { isDefault: false, name });
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

module.exports = { listPaymentMethods, createPaymentMethod, deletePaymentMethod };
