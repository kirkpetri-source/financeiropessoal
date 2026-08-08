import { describe, it, expect, beforeEach } from 'vitest';
import { criarEscopo } from '../data/escopo.js';
import { criarServicoDeFatura, cicloDaData, datasDoCiclo } from './invoiceService.js';

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
    Timestamp: { fromDate: (d) => ({ toDate: () => d, _fake: true }) },
  },
};

const escopoDe = criarEscopo(fakeDb, fakeAdmin);
const FAMILIA = 'fam-1';

describe('cicloDaData (função pura)', () => {
  it('compra antes ou no dia do fechamento entra no ciclo do próprio mês', () => {
    expect(cicloDaData(new Date(2026, 7, 3), 5)).toBe('2026-08');
    expect(cicloDaData(new Date(2026, 7, 5), 5)).toBe('2026-08');
  });

  it('compra depois do fechamento entra no ciclo seguinte', () => {
    expect(cicloDaData(new Date(2026, 7, 6), 5)).toBe('2026-09');
  });

  it('trava o dia de fechamento no último dia de fevereiro', () => {
    expect(cicloDaData(new Date(2026, 1, 28), 31)).toBe('2026-02');
  });
});

describe('datasDoCiclo (função pura)', () => {
  it('vencimento com dia maior que o fechamento fica no mesmo mês', () => {
    const { closingDate, dueDate } = datasDoCiclo('2026-08', 5, 12);
    expect(closingDate.getMonth()).toBe(7);
    expect(dueDate.getMonth()).toBe(7);
    expect(dueDate.getDate()).toBe(12);
  });

  it('vencimento com dia menor que o fechamento cai no mês seguinte', () => {
    const { closingDate, dueDate } = datasDoCiclo('2026-08', 28, 5);
    expect(closingDate.getMonth()).toBe(7);
    expect(dueDate.getMonth()).toBe(8);
    expect(dueDate.getDate()).toBe(5);
  });
});

beforeEach(() => {
  estado.documentos = {
    'paymentMethods/pm-nubank': {
      householdId: FAMILIA, name: 'Nubank', isDefault: false,
      isCreditCard: true, closingDay: 5, dueDay: 12,
    },
  };
});

describe('resumoFaturaAberta', () => {
  it('soma só as despesas confirmadas do ciclo corrente do cartão', async () => {
    const svc = criarServicoDeFatura({ db: fakeDb, admin: fakeAdmin });
    const dados = escopoDe(FAMILIA);
    const pm = await dados.buscarDoc('paymentMethods', 'pm-nubank');

    estado.documentos['transactions/tx-1'] = {
      householdId: FAMILIA, paymentMethodId: 'pm-nubank', type: 'EXPENSE',
      status: 'CONFIRMED', amount: 100, date: new Date(2026, 7, 3),
    };
    // Depois do fechamento — vai para o ciclo seguinte, não entra aqui.
    estado.documentos['transactions/tx-2'] = {
      householdId: FAMILIA, paymentMethodId: 'pm-nubank', type: 'EXPENSE',
      status: 'CONFIRMED', amount: 200, date: new Date(2026, 7, 10),
    };
    // Pendente não conta.
    estado.documentos['transactions/tx-3'] = {
      householdId: FAMILIA, paymentMethodId: 'pm-nubank', type: 'EXPENSE',
      status: 'PENDING', amount: 999, date: new Date(2026, 7, 2),
    };

    const resumo = await svc.resumoFaturaAberta(dados, pm, new Date(2026, 7, 3));
    expect(resumo).toMatchObject({ referenceCycle: '2026-08', totalCents: 10000, status: 'aberta', transacoes: 1 });
  });
});

describe('fecharFaturasDoDia (job cross-tenant)', () => {
  it('fecha a fatura de quem chegou no dia do fechamento e não duplica', async () => {
    const svc = criarServicoDeFatura({ db: fakeDb, admin: fakeAdmin });
    const dados = escopoDe(FAMILIA);

    estado.documentos['transactions/tx-1'] = {
      householdId: FAMILIA, paymentMethodId: 'pm-nubank', type: 'EXPENSE',
      status: 'CONFIRMED', amount: 84.9, date: new Date(2026, 7, 1),
    };

    const r1 = await svc.fecharFaturasDoDia(new Date(2026, 7, 5), escopoDe);
    expect(r1.fechadas).toBe(1);
    expect(r1.erros).toHaveLength(0);

    const historico = await svc.historico(dados, 'pm-nubank');
    expect(historico).toHaveLength(1);
    expect(historico[0]).toMatchObject({ status: 'fechada', totalCents: 8490, referenceCycle: '2026-08' });

    const r2 = await svc.fecharFaturasDoDia(new Date(2026, 7, 6), escopoDe);
    expect(r2.fechadas).toBe(0);
  });

  it('marcarComoPaga muda o status sem depender do provedor de pagamento', async () => {
    const svc = criarServicoDeFatura({ db: fakeDb, admin: fakeAdmin });
    const dados = escopoDe(FAMILIA);

    await svc.fecharFaturasDoDia(new Date(2026, 7, 5), escopoDe);
    const [fatura] = await svc.historico(dados, 'pm-nubank');

    const paga = await svc.marcarComoPaga(dados, fatura.id);
    expect(paga.status).toBe('paga');
  });

  it('não fecha cartão sem householdId ou sem dias configurados', async () => {
    estado.documentos['paymentMethods/pm-solto'] = { name: 'Sem dono', isCreditCard: true, closingDay: 5, dueDay: 12 };
    estado.documentos['paymentMethods/pm-incompleto'] = { householdId: FAMILIA, isCreditCard: true };

    const svc = criarServicoDeFatura({ db: fakeDb, admin: fakeAdmin });
    const r = await svc.fecharFaturasDoDia(new Date(2026, 7, 5), escopoDe);
    expect(r.fechadas).toBe(1); // só o pm-nubank, válido
  });
});
