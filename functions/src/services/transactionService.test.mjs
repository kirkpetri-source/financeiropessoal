import { describe, it, expect, beforeEach } from 'vitest';
import { criarEscopo } from '../data/escopo.js';
import { criarServicoDeTransacoes } from './transactionService.js';

/**
 * Confere a checagem de posse de categoryId/paymentMethodId adicionada na
 * auditoria: um ID Firestore de outra família não pode ser usado para
 * carimbar um lançamento (vazava nome/cor de categoria/forma alheia via
 * enriquecer()).
 */

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
  async getAll(...refs) { return Promise.all(refs.map((r) => r.get())); },
};

const fakeAdmin = {
  firestore: {
    FieldValue: { serverTimestamp: () => '<agora>' },
    Timestamp: { fromDate: (d) => ({ toDate: () => d }) },
  },
};

const escopoDe = criarEscopo(fakeDb, fakeAdmin);
const { createTransaction, updateTransaction } = criarServicoDeTransacoes({ db: fakeDb, admin: fakeAdmin });
const FAMILIA = 'fam-1';

beforeEach(() => {
  estado.documentos = {
    'categories/cat-mercado': { householdId: FAMILIA, name: 'Mercado', color: '#111' },
    'paymentMethods/pm-pix': { householdId: FAMILIA, name: 'Pix' },
    'categories/cat-padrao': { isDefault: true, name: 'Padrão do sistema', color: '#999' },
    'categories/cat-de-outra-familia': { householdId: 'fam-2', name: 'Categoria da fam-2' },
    'paymentMethods/pm-de-outra-familia': { householdId: 'fam-2', name: 'Forma da fam-2' },
    'categories/cat-lazer': { householdId: FAMILIA, name: 'Lazer', color: '#222' },
    'subcategories/sub-padaria': { householdId: FAMILIA, name: 'Padaria', categoryId: 'cat-mercado' },
    'subcategories/sub-cinema': { householdId: FAMILIA, name: 'Cinema', categoryId: 'cat-lazer' },
    'subcategories/sub-de-outra-familia': { householdId: 'fam-2', name: 'Sub da fam-2', categoryId: 'cat-mercado' },
  };
});

describe('createTransaction/updateTransaction — subcategoria', () => {
  it('cria com subcategoria válida da mesma categoria', async () => {
    const dados = escopoDe(FAMILIA);
    const t = await createTransaction(dados, {
      type: 'EXPENSE', description: 'Pão', amount: 10, date: '2026-08-01',
      categoryId: 'cat-mercado', subcategoryId: 'sub-padaria', paymentMethodId: 'pm-pix',
    });
    expect(t.subcategory.name).toBe('Padaria');
  });

  it('recusa subcategoria de outra categoria', async () => {
    const dados = escopoDe(FAMILIA);
    await expect(createTransaction(dados, {
      type: 'EXPENSE', description: 'Pão', amount: 10, date: '2026-08-01',
      categoryId: 'cat-lazer', subcategoryId: 'sub-padaria', paymentMethodId: 'pm-pix',
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('recusa subcategoria de outra família', async () => {
    const dados = escopoDe(FAMILIA);
    await expect(createTransaction(dados, {
      type: 'EXPENSE', description: 'Pão', amount: 10, date: '2026-08-01',
      categoryId: 'cat-mercado', subcategoryId: 'sub-de-outra-familia', paymentMethodId: 'pm-pix',
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('atualiza só a subcategoria, validando contra a categoria já gravada', async () => {
    const dados = escopoDe(FAMILIA);
    const criada = await createTransaction(dados, {
      type: 'EXPENSE', description: 'Pão', amount: 10, date: '2026-08-01',
      categoryId: 'cat-mercado', paymentMethodId: 'pm-pix',
    });

    const atualizada = await updateTransaction(dados, criada.id, { subcategoryId: 'sub-padaria' });
    expect(atualizada.subcategory.name).toBe('Padaria');
  });

  it('recusa atualizar com subcategoria que não bate com a categoria já gravada', async () => {
    const dados = escopoDe(FAMILIA);
    const criada = await createTransaction(dados, {
      type: 'EXPENSE', description: 'Pão', amount: 10, date: '2026-08-01',
      categoryId: 'cat-mercado', paymentMethodId: 'pm-pix',
    });

    await expect(
      updateTransaction(dados, criada.id, { subcategoryId: 'sub-cinema' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('subcategoryId null limpa a subcategoria', async () => {
    const dados = escopoDe(FAMILIA);
    const criada = await createTransaction(dados, {
      type: 'EXPENSE', description: 'Pão', amount: 10, date: '2026-08-01',
      categoryId: 'cat-mercado', subcategoryId: 'sub-padaria', paymentMethodId: 'pm-pix',
    });

    const atualizada = await updateTransaction(dados, criada.id, { subcategoryId: null });
    expect(atualizada.subcategory).toBeNull();
  });
});

describe('createTransaction — checagem de posse', () => {
  it('cria normalmente com categoria/forma da própria família', async () => {
    const dados = escopoDe(FAMILIA);
    const t = await createTransaction(dados, {
      type: 'EXPENSE', description: 'Compra', amount: 50, date: '2026-08-01',
      categoryId: 'cat-mercado', paymentMethodId: 'pm-pix',
    });
    expect(t.category.name).toBe('Mercado');
  });

  it('aceita categoria padrão do sistema (isDefault)', async () => {
    const dados = escopoDe(FAMILIA);
    const t = await createTransaction(dados, {
      type: 'EXPENSE', description: 'Compra', amount: 50, date: '2026-08-01',
      categoryId: 'cat-padrao', paymentMethodId: 'pm-pix',
    });
    expect(t.category.name).toBe('Padrão do sistema');
  });

  it('recusa categoryId de outra família', async () => {
    const dados = escopoDe(FAMILIA);
    await expect(createTransaction(dados, {
      type: 'EXPENSE', description: 'Compra', amount: 50, date: '2026-08-01',
      categoryId: 'cat-de-outra-familia', paymentMethodId: 'pm-pix',
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('recusa paymentMethodId de outra família', async () => {
    const dados = escopoDe(FAMILIA);
    await expect(createTransaction(dados, {
      type: 'EXPENSE', description: 'Compra', amount: 50, date: '2026-08-01',
      categoryId: 'cat-mercado', paymentMethodId: 'pm-de-outra-familia',
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('updateTransaction — checagem de posse', () => {
  it('recusa mover o lançamento para categoria de outra família', async () => {
    const dados = escopoDe(FAMILIA);
    const criada = await createTransaction(dados, {
      type: 'EXPENSE', description: 'Compra', amount: 50, date: '2026-08-01',
      categoryId: 'cat-mercado', paymentMethodId: 'pm-pix',
    });

    await expect(
      updateTransaction(dados, criada.id, { categoryId: 'cat-de-outra-familia' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('atualização sem mexer em categoryId/paymentMethodId continua funcionando', async () => {
    const dados = escopoDe(FAMILIA);
    const criada = await createTransaction(dados, {
      type: 'EXPENSE', description: 'Compra', amount: 50, date: '2026-08-01',
      categoryId: 'cat-mercado', paymentMethodId: 'pm-pix',
    });

    const atualizada = await updateTransaction(dados, criada.id, { description: 'Compra atualizada' });
    expect(atualizada.description).toBe('Compra atualizada');
  });
});
