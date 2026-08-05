import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Testes de isolamento entre famílias.
 *
 * O Firestore é dublado por um fake em memória. Não é para testar o Firestore
 * — é para provar que a camada de escopo NUNCA emite uma consulta sem o filtro
 * do tenant, e que buscar um documento de outra família devolve null.
 */

const estado = {
  documentos: {},      // 'colecao/id' -> dados
  filtrosAplicados: [], // registro de todo .where() emitido
};

function fakeQuery(colecao, filtros = []) {
  return {
    where(campo, op, valor) {
      const novos = [...filtros, { campo, op, valor }];
      estado.filtrosAplicados.push({ colecao, campo, op, valor });
      return fakeQuery(colecao, novos);
    },
    orderBy() { return fakeQuery(colecao, filtros); },
    limit() { return fakeQuery(colecao, filtros); },
    async get() {
      const docs = Object.entries(estado.documentos)
        .filter(([chave]) => chave.startsWith(`${colecao}/`))
        .map(([chave, dados]) => ({ id: chave.split('/')[1], data: () => dados }))
        .filter((doc) => filtros.every((f) => {
          const v = doc.data()[f.campo];
          return f.op === '==' ? v === f.valor : true;
        }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
    _filtros: filtros,
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
          async update(dados) {
            Object.assign(estado.documentos[`${nome}/${id}`], dados);
          },
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

// Injecao direta: o modulo sob teste recebe este banco falso por parametro.
// Nada de vi.mock — mock que nao pega faz o teste escrever em producao.
import { criarEscopo, ErroDeEscopo } from './escopo.js';

const fakeAdmin = {
  firestore: {
    FieldValue: { serverTimestamp: () => '<agora>' },
    Timestamp: { fromDate: (d) => d },
  },
};

const escopoDe = criarEscopo(fakeDb, fakeAdmin);

const FAMILIA_A = 'household-A';
const FAMILIA_B = 'household-B';

beforeEach(() => {
  estado.documentos = {
    'transactions/tx-da-A': { householdId: FAMILIA_A, description: 'mercado da A', amount: 100 },
    'transactions/tx-da-B': { householdId: FAMILIA_B, description: 'mercado da B', amount: 200 },
    'categories/cat-da-B': { householdId: FAMILIA_B, name: 'Categoria da B' },
    'categories/cat-padrao': { isDefault: true, name: 'Mercado' },
  };
  estado.filtrosAplicados = [];
});

describe('escopoDe — criação', () => {
  it('recusa householdId ausente, vazio ou inválido', () => {
    expect(() => escopoDe()).toThrow(ErroDeEscopo);
    expect(() => escopoDe(null)).toThrow(ErroDeEscopo);
    expect(() => escopoDe('')).toThrow(ErroDeEscopo);
    expect(() => escopoDe('   ')).toThrow(ErroDeEscopo);
    expect(() => escopoDe(123)).toThrow(ErroDeEscopo);
  });

  it('recusa coleção não declarada', () => {
    expect(() => escopoDe(FAMILIA_A).consultar('coisas')).toThrow(ErroDeEscopo);
  });
});

describe('isolamento entre famílias', () => {
  it('toda consulta sai com o filtro do tenant', async () => {
    await escopoDe(FAMILIA_A).consultar('transactions').get();

    const filtroDeTenant = estado.filtrosAplicados.find((f) => f.campo === 'householdId');
    expect(filtroDeTenant).toBeDefined();
    expect(filtroDeTenant.valor).toBe(FAMILIA_A);
  });

  it('mantém o filtro do tenant mesmo encadeando outros where', async () => {
    await escopoDe(FAMILIA_A).consultar('transactions')
      .where('type', '==', 'EXPENSE')
      .where('referenceMonth', '==', '2026-08')
      .get();

    const deTenant = estado.filtrosAplicados.filter((f) => f.campo === 'householdId');
    expect(deTenant).toHaveLength(1);
    expect(deTenant[0].valor).toBe(FAMILIA_A);
  });

  it('a consulta da família A não traz documento da família B', async () => {
    const snap = await escopoDe(FAMILIA_A).consultar('transactions').get();
    const descricoes = snap.docs.map((d) => d.data().description);

    expect(descricoes).toContain('mercado da A');
    expect(descricoes).not.toContain('mercado da B');
  });

  it('buscar por ID um documento de outra família devolve null', async () => {
    expect(await escopoDe(FAMILIA_A).buscarDoc('transactions', 'tx-da-B')).toBeNull();
  });

  it('não distingue "não existe" de "é de outra família"', async () => {
    const deOutra = await escopoDe(FAMILIA_A).buscarDoc('transactions', 'tx-da-B');
    const inexistente = await escopoDe(FAMILIA_A).buscarDoc('transactions', 'tx-que-nao-existe');
    expect(deOutra).toEqual(inexistente); // ambos null — não dá para sondar IDs
  });

  it('busca normalmente o documento da própria família', async () => {
    const tx = await escopoDe(FAMILIA_A).buscarDoc('transactions', 'tx-da-A');
    expect(tx).toMatchObject({ id: 'tx-da-A', description: 'mercado da A' });
  });
});

describe('escrita', () => {
  it('carimba o householdId ao criar', async () => {
    const criado = await escopoDe(FAMILIA_A).criar('transactions', { description: 'novo', amount: 10 });
    expect(criado.householdId).toBe(FAMILIA_A);
  });

  it('ignora householdId enviado de fora ao criar', async () => {
    const criado = await escopoDe(FAMILIA_A).criar('transactions', {
      description: 'tentativa', householdId: FAMILIA_B,
    });
    expect(criado.householdId).toBe(FAMILIA_A);
  });

  it('não deixa atualizar documento de outra família', async () => {
    await expect(
      escopoDe(FAMILIA_A).atualizar('transactions', 'tx-da-B', { amount: 999 })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(estado.documentos['transactions/tx-da-B'].amount).toBe(200);
  });

  it('não deixa apagar documento de outra família', async () => {
    await expect(
      escopoDe(FAMILIA_A).remover('transactions', 'tx-da-B')
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(estado.documentos['transactions/tx-da-B']).toBeDefined();
  });

  it('não deixa mover um registro para outra família via update', async () => {
    await escopoDe(FAMILIA_A).atualizar('transactions', 'tx-da-A', {
      householdId: FAMILIA_B, amount: 50,
    });

    expect(estado.documentos['transactions/tx-da-A'].householdId).toBe(FAMILIA_A);
    expect(estado.documentos['transactions/tx-da-A'].amount).toBe(50);
  });
});

describe('coleções mistas (categorias e formas de pagamento)', () => {
  it('lê o registro padrão global, marcado como somente leitura', async () => {
    const cat = await escopoDe(FAMILIA_A).buscarDoc('categories', 'cat-padrao');
    expect(cat).toMatchObject({ name: 'Mercado', _somenteLeitura: true });
  });

  it('não deixa alterar registro padrão global', async () => {
    await expect(
      escopoDe(FAMILIA_A).atualizar('categories', 'cat-padrao', { name: 'Sequestrada' })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(estado.documentos['categories/cat-padrao'].name).toBe('Mercado');
  });

  it('não enxerga categoria personalizada de outra família', async () => {
    expect(await escopoDe(FAMILIA_A).buscarDoc('categories', 'cat-da-B')).toBeNull();
  });
});
