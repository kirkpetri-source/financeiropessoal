import { describe, it, expect, beforeEach } from 'vitest';
import { criarEscopo } from '../data/escopo.js';
import * as subcategoryService from './subcategoryService.js';
import * as categoryService from './categoryService.js';

const estado = { documentos: {} };

function fakeQuery(colecao, filtros = []) {
  return {
    where(campo, op, valor) { return fakeQuery(colecao, [...filtros, { campo, op, valor }]); },
    orderBy() { return fakeQuery(colecao, filtros); },
    limit() { return fakeQuery(colecao, filtros); },
    async get() {
      const docs = Object.entries(estado.documentos)
        .filter(([chave]) => chave.startsWith(`${colecao}/`))
        .map(([chave, dados]) => ({ id: chave.split('/')[1], data: () => dados }))
        .filter((doc) => filtros.every((f) => doc.data()[f.campo] === f.valor));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  };
}

const fakeDb = {
  collection(nome) {
    const q = fakeQuery(nome);
    return {
      ...q,
      doc(id) {
        return {
          id,
          async get() {
            const dados = estado.documentos[`${nome}/${id}`];
            return { exists: !!dados, id, data: () => dados };
          },
          async update(dados) { Object.assign(estado.documentos[`${nome}/${id}`], dados); },
          async delete() { delete estado.documentos[`${nome}/${id}`]; },
        };
      },
      async add(dados) {
        const id = `gerado-${Object.keys(estado.documentos).length}`;
        estado.documentos[`${nome}/${id}`] = dados;
        return { id, async get() { return { id, data: () => estado.documentos[`${nome}/${id}`] }; } };
      },
    };
  },
};

const fakeAdmin = {
  firestore: {
    FieldValue: { serverTimestamp: () => '<agora>' },
  },
};

const escopoDe = criarEscopo(fakeDb, fakeAdmin);
const FAMILIA = 'fam-1';

beforeEach(() => {
  estado.documentos = {
    'categories/cat-mercado': { householdId: FAMILIA, name: 'Mercado', type: 'EXPENSE' },
    'categories/cat-padrao': { isDefault: true, name: 'Alimentação', type: 'EXPENSE' },
    'categories/cat-de-outra-familia': { householdId: 'fam-2', name: 'Categoria da fam-2', type: 'EXPENSE' },
  };
});

describe('subcategoryService', () => {
  it('cria subcategoria válida sob categoria custom da família', async () => {
    const dados = escopoDe(FAMILIA);
    const criada = await subcategoryService.createSubcategory(dados, { name: 'Padaria', categoryId: 'cat-mercado' });
    expect(criada.name).toBe('Padaria');
    expect(criada.categoryId).toBe('cat-mercado');
  });

  it('cria subcategoria válida sob categoria padrão do sistema', async () => {
    const dados = escopoDe(FAMILIA);
    const criada = await subcategoryService.createSubcategory(dados, { name: 'Restaurante', categoryId: 'cat-padrao' });
    expect(criada.categoryId).toBe('cat-padrao');
  });

  it('recusa criar subcategoria com categoria de outra família', async () => {
    const dados = escopoDe(FAMILIA);
    await expect(
      subcategoryService.createSubcategory(dados, { name: 'X', categoryId: 'cat-de-outra-familia' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('recusa criar subcategoria com categoria inexistente', async () => {
    const dados = escopoDe(FAMILIA);
    await expect(
      subcategoryService.createSubcategory(dados, { name: 'X', categoryId: 'nao-existe' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('lista só as subcategorias da própria família, ordenadas por nome', async () => {
    const dados = escopoDe(FAMILIA);
    await subcategoryService.createSubcategory(dados, { name: 'Padaria', categoryId: 'cat-mercado' });
    await subcategoryService.createSubcategory(dados, { name: 'Açougue', categoryId: 'cat-mercado' });
    estado.documentos['subcategories/sub-de-outra-familia'] = { householdId: 'fam-2', name: 'Sub de outra família', categoryId: 'cat-mercado' };

    const lista = await subcategoryService.listSubcategories(dados);
    expect(lista.map((s) => s.name)).toEqual(['Açougue', 'Padaria']);
  });

  it('filtra por categoryId quando informado', async () => {
    const dados = escopoDe(FAMILIA);
    await subcategoryService.createSubcategory(dados, { name: 'Padaria', categoryId: 'cat-mercado' });
    await subcategoryService.createSubcategory(dados, { name: 'Restaurante', categoryId: 'cat-padrao' });

    const lista = await subcategoryService.listSubcategories(dados, 'cat-padrao');
    expect(lista.map((s) => s.name)).toEqual(['Restaurante']);
  });

  it('atualiza e remove', async () => {
    const dados = escopoDe(FAMILIA);
    const criada = await subcategoryService.createSubcategory(dados, { name: 'Padaria', categoryId: 'cat-mercado' });

    const atualizada = await subcategoryService.updateSubcategory(dados, criada.id, { name: 'Padaria e Confeitaria', categoryId: 'cat-mercado' });
    expect(atualizada.name).toBe('Padaria e Confeitaria');

    await subcategoryService.deleteSubcategory(dados, criada.id);
    expect(await subcategoryService.listSubcategories(dados)).toHaveLength(0);
  });

  it('recusa apagar subcategoria em uso em lançamento', async () => {
    const dados = escopoDe(FAMILIA);
    const criada = await subcategoryService.createSubcategory(dados, { name: 'Padaria', categoryId: 'cat-mercado' });
    estado.documentos['transactions/tx-1'] = {
      householdId: FAMILIA, categoryId: 'cat-mercado', subcategoryId: criada.id, type: 'EXPENSE', amount: 10,
    };

    await expect(subcategoryService.deleteSubcategory(dados, criada.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('não enxerga nem edita subcategoria de outra família', async () => {
    const dados = escopoDe(FAMILIA);
    estado.documentos['subcategories/sub-de-outra-familia'] = { householdId: 'fam-2', name: 'Sub de outra família', categoryId: 'cat-mercado' };

    await expect(
      subcategoryService.updateSubcategory(dados, 'sub-de-outra-familia', { name: 'X', categoryId: 'cat-mercado' })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(subcategoryService.deleteSubcategory(dados, 'sub-de-outra-familia')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('recusa apagar categoria que ainda tem subcategoria cadastrada', async () => {
    const dados = escopoDe(FAMILIA);
    await subcategoryService.createSubcategory(dados, { name: 'Padaria', categoryId: 'cat-mercado' });

    await expect(categoryService.deleteCategory(dados, 'cat-mercado')).rejects.toMatchObject({ statusCode: 409 });
  });
});
