/**
 * Subcategorias — sempre da família, sem versão padrão/global (diferente de
 * `categories`). Cada uma referencia uma categoria-mãe (padrão ou custom).
 */

async function listSubcategories(dados, categoryId) {
  let query = dados.consultar('subcategories');
  if (categoryId) query = query.where('categoryId', '==', categoryId);

  const snap = await query.get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

async function validarCategoriaMae(dados, categoryId) {
  const categoria = await dados.buscarDoc('categories', categoryId);
  if (!categoria) throw Object.assign(new Error('Categoria inválida.'), { statusCode: 400 });
}

async function createSubcategory(dados, entrada) {
  await validarCategoriaMae(dados, entrada.categoryId);

  return dados.criar('subcategories', {
    name: entrada.name,
    categoryId: entrada.categoryId,
  });
}

async function updateSubcategory(dados, subcategoryId, entrada) {
  const atual = await dados.buscarDoc('subcategories', subcategoryId);
  if (!atual) throw Object.assign(new Error('Subcategoria não encontrada.'), { statusCode: 404 });

  await validarCategoriaMae(dados, entrada.categoryId);

  return dados.atualizar('subcategories', subcategoryId, {
    name: entrada.name,
    categoryId: entrada.categoryId,
  });
}

async function deleteSubcategory(dados, subcategoryId) {
  const atual = await dados.buscarDoc('subcategories', subcategoryId);
  if (!atual) throw Object.assign(new Error('Subcategoria não encontrada.'), { statusCode: 404 });

  const emUso = await dados.consultar('transactions')
    .where('subcategoryId', '==', subcategoryId).limit(1).get();

  if (!emUso.empty) {
    throw Object.assign(new Error('Subcategoria em uso em lançamentos.'), { statusCode: 409 });
  }

  await dados.remover('subcategories', subcategoryId);
}

module.exports = { listSubcategories, createSubcategory, updateSubcategory, deleteSubcategory };
