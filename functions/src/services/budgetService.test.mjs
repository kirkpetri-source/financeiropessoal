import { describe, it, expect, beforeEach } from 'vitest';
import { criarEscopo } from '../data/escopo.js';
import { criarServicoDeOrcamento } from './budgetService.js';

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
    Timestamp: { fromDate: (d) => d },
  },
};

const escopoDe = criarEscopo(fakeDb, fakeAdmin);
const svc = criarServicoDeOrcamento({ db: fakeDb });
const FAMILIA = 'fam-1';

beforeEach(() => {
  estado.documentos = {
    'categories/cat-mercado': { householdId: FAMILIA, name: 'Mercado', color: '#111' },
    'categories/cat-lazer': { householdId: FAMILIA, name: 'Lazer', color: '#222' },
    'categories/cat-de-outra-familia': { householdId: 'fam-2', name: 'Categoria da fam-2', color: '#333' },
  };
});

describe('budgetService', () => {
  it('recusa criar orçamento com categoria de outra família', async () => {
    const dados = escopoDe(FAMILIA);
    await expect(
      svc.createBudget(dados, { categoryId: 'cat-de-outra-familia', monthlyLimitCents: 50000 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('recusa atualizar orçamento apontando para categoria de outra família', async () => {
    const dados = escopoDe(FAMILIA);
    const criado = await svc.createBudget(dados, { categoryId: 'cat-mercado', monthlyLimitCents: 50000 });

    await expect(
      svc.updateBudget(dados, criado.id, { categoryId: 'cat-de-outra-familia' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('cria um orçamento e recusa duplicar a mesma categoria', async () => {
    const dados = escopoDe(FAMILIA);
    await svc.createBudget(dados, { categoryId: 'cat-mercado', monthlyLimitCents: 50000 });

    await expect(
      svc.createBudget(dados, { categoryId: 'cat-mercado', monthlyLimitCents: 10000 })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('lista com o nome da categoria já resolvido', async () => {
    const dados = escopoDe(FAMILIA);
    await svc.createBudget(dados, { categoryId: 'cat-mercado', monthlyLimitCents: 50000 });

    const lista = await svc.listBudgets(dados);
    expect(lista).toHaveLength(1);
    expect(lista[0].category.name).toBe('Mercado');
  });

  it('atualiza e remove', async () => {
    const dados = escopoDe(FAMILIA);
    const criado = await svc.createBudget(dados, { categoryId: 'cat-lazer', monthlyLimitCents: 20000 });

    const atualizado = await svc.updateBudget(dados, criado.id, { monthlyLimitCents: 30000 });
    expect(atualizado.monthlyLimitCents).toBe(30000);

    await svc.deleteBudget(dados, criado.id);
    expect(await svc.listBudgets(dados)).toHaveLength(0);
  });

  it('resumo do mês soma só despesas confirmadas da categoria e marca estouro', async () => {
    const dados = escopoDe(FAMILIA);
    await svc.createBudget(dados, { categoryId: 'cat-mercado', monthlyLimitCents: 10000 });

    estado.documentos['transactions/tx-1'] = {
      householdId: FAMILIA, categoryId: 'cat-mercado', type: 'EXPENSE',
      status: 'CONFIRMED', amount: 84.9, referenceMonth: '2026-08',
    };
    estado.documentos['transactions/tx-2'] = {
      householdId: FAMILIA, categoryId: 'cat-mercado', type: 'EXPENSE',
      status: 'CONFIRMED', amount: 30, referenceMonth: '2026-08',
    };
    // Pendente não conta como gasto ainda.
    estado.documentos['transactions/tx-3'] = {
      householdId: FAMILIA, categoryId: 'cat-mercado', type: 'EXPENSE',
      status: 'PENDING', amount: 999, referenceMonth: '2026-08',
    };
    // Mês errado não entra.
    estado.documentos['transactions/tx-4'] = {
      householdId: FAMILIA, categoryId: 'cat-mercado', type: 'EXPENSE',
      status: 'CONFIRMED', amount: 500, referenceMonth: '2026-07',
    };

    const resumo = await svc.resumoDoMes(dados, '2026-08');
    expect(resumo).toHaveLength(1);
    expect(resumo[0]).toMatchObject({
      categoryName: 'Mercado', limitCents: 10000, spentCents: 11490, estourado: true,
    });
  });

  it('orçamento inativo não entra no resumo', async () => {
    const dados = escopoDe(FAMILIA);
    const criado = await svc.createBudget(dados, { categoryId: 'cat-mercado', monthlyLimitCents: 10000 });
    await svc.updateBudget(dados, criado.id, { active: false });

    expect(await svc.resumoDoMes(dados, '2026-08')).toHaveLength(0);
  });
});
