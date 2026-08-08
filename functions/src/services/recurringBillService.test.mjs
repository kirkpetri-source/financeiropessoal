import { describe, it, expect, beforeEach } from 'vitest';
import { criarEscopo } from '../data/escopo.js';
import {
  criarServicoDeContasRecorrentes, precisaGerar, proximaOcorrencia, proximasVencer,
} from './recurringBillService.js';

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
const FAMILIA = 'fam-1';

// Dublê de transactionService.createTransaction — registra o que recebeu, sem
// depender do serviço de verdade (que arrastaria firebaseAdmin de produção).
function criarTransacaoFalsa() {
  const chamadas = [];
  const fn = async (dados, entrada) => {
    chamadas.push(entrada);
    return dados.criar('transactions', entrada);
  };
  fn.chamadas = chamadas;
  return fn;
}

beforeEach(() => {
  estado.documentos = {
    'categories/cat-aluguel': { householdId: FAMILIA, name: 'Moradia' },
    'paymentMethods/pm-pix': { householdId: FAMILIA, name: 'Pix' },
  };
});

describe('precisaGerar (função pura)', () => {
  const base = { active: true, dueDay: 10, lastGeneratedMonth: null };

  it('gera quando o dia chegou e ainda não gerou este mês', () => {
    expect(precisaGerar(base, new Date(2026, 7, 10))).toBe(true);
    expect(precisaGerar(base, new Date(2026, 7, 15))).toBe(true);
  });

  it('não gera antes do dia de vencimento', () => {
    expect(precisaGerar(base, new Date(2026, 7, 9))).toBe(false);
  });

  it('não gera duas vezes no mesmo mês', () => {
    expect(precisaGerar({ ...base, lastGeneratedMonth: '2026-08' }, new Date(2026, 7, 20))).toBe(false);
  });

  it('conta inativa nunca gera', () => {
    expect(precisaGerar({ ...base, active: false }, new Date(2026, 7, 15))).toBe(false);
  });

  it('trava dia inválido no último dia do mês (dueDay 31 em fevereiro)', () => {
    expect(precisaGerar({ ...base, dueDay: 31 }, new Date(2026, 1, 28))).toBe(true);
  });
});

describe('proximaOcorrencia (função pura)', () => {
  it('aponta para este mês quando ainda não venceu nem gerou', () => {
    const data = proximaOcorrencia({ dueDay: 20, lastGeneratedMonth: null }, new Date(2026, 7, 5));
    expect(data.getMonth()).toBe(7);
    expect(data.getDate()).toBe(20);
  });

  it('pula para o mês seguinte quando já gerou este mês', () => {
    const data = proximaOcorrencia({ dueDay: 5, lastGeneratedMonth: '2026-08' }, new Date(2026, 7, 20));
    expect(data.getMonth()).toBe(8);
  });
});

describe('proximasVencer (função pura)', () => {
  it('filtra pela janela de dias e ordena pela data mais próxima', () => {
    const hoje = new Date(2026, 7, 1);
    const bills = [
      { id: 'longe', active: true, dueDay: 25, lastGeneratedMonth: null },
      { id: 'perto', active: true, dueDay: 3, lastGeneratedMonth: null },
      { id: 'inativa', active: false, dueDay: 2, lastGeneratedMonth: null },
    ];
    const proximas = proximasVencer(bills, hoje, 7);
    expect(proximas.map((b) => b.id)).toEqual(['perto']);
  });
});

describe('CRUD via escopo', () => {
  it('cria com lastGeneratedMonth nulo e resolve categoria/forma de pagamento', async () => {
    const svc = criarServicoDeContasRecorrentes({ db: fakeDb, criarTransacao: criarTransacaoFalsa() });
    const dados = escopoDe(FAMILIA);
    const criada = await svc.createRecurringBill(dados, {
      description: 'Aluguel', amountCents: 150000, type: 'EXPENSE',
      dueDay: 10, categoryId: 'cat-aluguel', paymentMethodId: 'pm-pix',
    });
    expect(criada.lastGeneratedMonth).toBeNull();
    expect(criada.category.name).toBe('Moradia');

    const lista = await svc.listRecurringBills(dados);
    expect(lista).toHaveLength(1);
  });
});

describe('gerarLancamentosDoDia (job cross-tenant)', () => {
  it('gera o lançamento de quem vence hoje e marca o mês como gerado', async () => {
    const criarTransacao = criarTransacaoFalsa();
    const svc = criarServicoDeContasRecorrentes({ db: fakeDb, criarTransacao });
    const dados = escopoDe(FAMILIA);
    const criada = await svc.createRecurringBill(dados, {
      description: 'Aluguel', amountCents: 150000, type: 'EXPENSE',
      dueDay: 10, categoryId: 'cat-aluguel', paymentMethodId: 'pm-pix',
    });

    const resultado = await svc.gerarLancamentosDoDia(new Date(2026, 7, 10), escopoDe);
    expect(resultado.geradas).toBe(1);
    expect(resultado.erros).toHaveLength(0);
    expect(criarTransacao.chamadas[0]).toMatchObject({ origin: 'RECURRING', description: 'Aluguel', amount: 1500 });

    const bill = await dados.buscarDoc('recurringBills', criada.id);
    expect(bill.lastGeneratedMonth).toBe('2026-08');
  });

  it('não gera de novo no mesmo mês', async () => {
    const svc = criarServicoDeContasRecorrentes({ db: fakeDb, criarTransacao: criarTransacaoFalsa() });
    const dados = escopoDe(FAMILIA);
    await svc.createRecurringBill(dados, {
      description: 'Aluguel', amountCents: 150000, type: 'EXPENSE',
      dueDay: 10, categoryId: 'cat-aluguel', paymentMethodId: 'pm-pix',
    });

    await svc.gerarLancamentosDoDia(new Date(2026, 7, 10), escopoDe);
    const segunda = await svc.gerarLancamentosDoDia(new Date(2026, 7, 20), escopoDe);
    expect(segunda.geradas).toBe(0);
  });
});
