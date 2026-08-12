/**
 * Categorias — mistura registros globais (isDefault) com os da família.
 * As padrão são referência compartilhada e ninguém as edita; as personalizadas
 * pertencem à família e só ela enxerga.
 */

async function listCategories(dados) {
  const [snapPadrao, snapDaFamilia] = await Promise.all([
    dados.consultarPadroes('categories').get(),
    dados.consultar('categories').get(),
  ]);

  const padrao = snapPadrao.docs.map((d) => ({ id: d.id, ...d.data() }));
  const daFamilia = snapDaFamilia.docs.map((d) => ({ id: d.id, ...d.data() }));

  return [...padrao, ...daFamilia].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

async function createCategory(dados, entrada) {
  return dados.criar('categories', {
    isDefault: false,
    name: entrada.name,
    type: entrada.type,
    color: entrada.color || null,
  });
}

async function updateCategory(dados, categoryId, entrada) {
  const atual = await dados.buscarDoc('categories', categoryId);
  if (!atual) throw Object.assign(new Error('Categoria não encontrada.'), { statusCode: 404 });
  if (atual._somenteLeitura) {
    throw Object.assign(new Error('Categoria padrão do sistema não pode ser editada.'), { statusCode: 403 });
  }

  return dados.atualizar('categories', categoryId, {
    name: entrada.name,
    type: entrada.type,
    color: entrada.color ?? atual.color,
  });
}

async function deleteCategory(dados, categoryId) {
  const atual = await dados.buscarDoc('categories', categoryId);
  if (!atual) throw Object.assign(new Error('Categoria não encontrada.'), { statusCode: 404 });
  if (atual._somenteLeitura) {
    throw Object.assign(new Error('Categoria padrão do sistema não pode ser excluída.'), { statusCode: 403 });
  }

  const emUso = await dados.consultar('transactions')
    .where('categoryId', '==', categoryId).limit(1).get();

  if (!emUso.empty) {
    throw Object.assign(new Error('Categoria em uso em lançamentos.'), { statusCode: 409 });
  }

  const comSubcategoria = await dados.consultar('subcategories')
    .where('categoryId', '==', categoryId).limit(1).get();

  if (!comSubcategoria.empty) {
    throw Object.assign(new Error('Categoria tem subcategorias cadastradas.'), { statusCode: 409 });
  }

  await dados.remover('categories', categoryId);
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory };
