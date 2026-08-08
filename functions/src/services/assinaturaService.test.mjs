import { describe, it, expect, beforeEach } from 'vitest';
import { criarServicoDeAssinatura } from './assinaturaService.js';
import { STATUS } from '../assinatura/estado.js';

/**
 * Firestore e Mercado Pago dublados por injeção — nada aqui encosta em rede ou
 * em banco. O que estes testes protegem:
 *
 *   - só o provedor promove uma família para "active";
 *   - a reentrega do mesmo webhook não conta pagamento duas vezes;
 *   - o trial não é apagado por um checkout iniciado no meio dele.
 */

let armazem;

const AGORA_FALSO = '<agora>';

function aplicarCaminhos(alvo, dados) {
  for (const [chave, valor] of Object.entries(dados)) {
    const partes = chave.split('.');
    let no = alvo;
    while (partes.length > 1) {
      const p = partes.shift();
      if (typeof no[p] !== 'object' || no[p] === null) no[p] = {};
      no = no[p];
    }
    no[partes[0]] = valor;
  }
}

function fakeDb() {
  return {
    collection(nome) {
      return {
        doc(id) {
          const chave = `${nome}/${id}`;
          return {
            id,
            async get() {
              const dados = armazem.docs[chave];
              return { exists: !!dados, id, data: () => dados };
            },
            async update(dados) {
              if (!armazem.docs[chave]) throw new Error('doc inexistente');
              aplicarCaminhos(armazem.docs[chave], dados);
              armazem.updates.push({ chave, dados });
            },
            collection(sub) {
              const prefixo = `${chave}/${sub}`;
              return {
                doc(subId) {
                  return {
                    async create(dados) {
                      const k = `${prefixo}/${subId}`;
                      if (armazem.docs[k]) {
                        throw Object.assign(new Error('já existe'), { code: 6 });
                      }
                      armazem.docs[k] = dados;
                    },
                  };
                },
                orderBy() { return this; },
                limit() { return this; },
                async get() {
                  const docs = Object.entries(armazem.docs)
                    .filter(([k]) => k.startsWith(`${prefixo}/`))
                    .map(([k, v]) => ({ id: k.split('/').pop(), data: () => v }));
                  return { docs };
                },
              };
            },
          };
        },
      };
    },
  };
}

const fakeAdmin = {
  firestore: {
    FieldValue: { serverTimestamp: () => AGORA_FALSO },
    Timestamp: { fromDate: (d) => ({ toDate: () => d, _fake: true }) },
  },
};

/** Mercado Pago dublê. Cada método registra a chamada e devolve o combinado. */
function fakeCliente(respostas = {}) {
  const chamadas = [];
  const api = {
    async criarAssinatura(args) {
      chamadas.push(['criarAssinatura', args]);
      if (respostas.criarAssinatura instanceof Error) throw respostas.criarAssinatura;
      return respostas.criarAssinatura
        || { id: 'pre-1', linkDePagamento: 'https://mp/pagar', status: STATUS.PENDENTE };
    },
    async buscarAssinatura(id) {
      chamadas.push(['buscarAssinatura', id]);
      return respostas.buscarAssinatura || {};
    },
    async buscarPagamentoAutorizado(id) {
      chamadas.push(['buscarPagamentoAutorizado', id]);
      return respostas.buscarPagamentoAutorizado || {};
    },
    async cancelarAssinatura(id) {
      chamadas.push(['cancelarAssinatura', id]);
      return { id, status: STATUS.CANCELADA };
    },
  };
  api.chamadas = chamadas;
  return () => api;
}

function servicoCom(respostas) {
  return criarServicoDeAssinatura({ db: fakeDb(), admin: fakeAdmin, cliente: fakeCliente(respostas) });
}

function emDias(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

beforeEach(() => {
  armazem = {
    updates: [],
    docs: {
      'households/fam-1': {
        name: 'Família Teste',
        ownerId: 'user-1',
        subscription: {
          status: STATUS.TRIAL,
          plan: 'familia',
          trialEndsAt: { toDate: () => emDias(10) },
          provider: null,
          externalId: null,
        },
      },
    },
  };
});

describe('situação da família', () => {
  it('devolve o estado com mensagem pronta para o cliente', async () => {
    const s = await servicoCom({}).situacaoDaFamilia('fam-1');
    expect(s).toMatchObject({ podeLancar: true, emTrial: true, plano: 'familia', precoCentavos: 2490 });
    expect(s.mensagem).toMatch(/[Tt]este grátis/);
    expect(s.expiraEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('família inexistente dá 404', async () => {
    await expect(servicoCom({}).situacaoDaFamilia('fam-nao-existe')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('checkout', () => {
  it('guarda o id do provedor e devolve o link de pagamento', async () => {
    const svc = servicoCom({});
    const r = await svc.iniciarCheckout('fam-1', { email: 'kirk@exemplo.com', urlDeRetorno: 'https://app/x' });

    expect(r.linkDePagamento).toBe('https://mp/pagar');

    const sub = armazem.docs['households/fam-1'].subscription;
    expect(sub.provider).toBe('mercadopago');
    expect(sub.externalId).toBe('pre-1');
    expect(sub.payerEmail).toBe('kirk@exemplo.com');
  });

  it('não apaga o trial de quem assina no meio do teste', async () => {
    await servicoCom({}).iniciarCheckout('fam-1', { email: 'a@b.c', urlDeRetorno: 'x' });
    expect(armazem.docs['households/fam-1'].subscription.status).toBe(STATUS.TRIAL);
  });

  it('quem já teve o trial vencido vai para pendente', async () => {
    armazem.docs['households/fam-1'].subscription.status = STATUS.CANCELADA;
    await servicoCom({}).iniciarCheckout('fam-1', { email: 'a@b.c', urlDeRetorno: 'x' });
    expect(armazem.docs['households/fam-1'].subscription.status).toBe(STATUS.PENDENTE);
  });

  it('recusa cobrar de novo quem já está ativo', async () => {
    armazem.docs['households/fam-1'].subscription = {
      status: STATUS.ATIVA,
      currentPeriodEnd: { toDate: () => emDias(20) },
    };
    await expect(
      servicoCom({}).iniciarCheckout('fam-1', { email: 'a@b.c', urlDeRetorno: 'x' })
    ).rejects.toMatchObject({ statusCode: 409, codigo: 'JA_ASSINANTE' });
  });

  it('deixa refazer o checkout de quem está em carência', async () => {
    armazem.docs['households/fam-1'].subscription = {
      status: STATUS.ATIVA,
      currentPeriodEnd: { toDate: () => emDias(-2) },
    };
    const r = await servicoCom({}).iniciarCheckout('fam-1', { email: 'a@b.c', urlDeRetorno: 'x' });
    expect(r.linkDePagamento).toBeTruthy();
  });

  it('registra o checkout no histórico de cobrança', async () => {
    await servicoCom({}).iniciarCheckout('fam-1', { email: 'a@b.c', urlDeRetorno: 'x' });
    expect(armazem.docs['households/fam-1/billingEvents/checkout-pre-1']).toMatchObject({
      tipo: 'checkout_criado', externalId: 'pre-1',
    });
  });
});

describe('sincronização com o provedor', () => {
  it('promove para ativa e grava o fim do período', async () => {
    const svc = servicoCom({
      buscarAssinatura: {
        id: 'pre-1',
        householdId: 'fam-1',
        status: STATUS.ATIVA,
        statusDoProvedor: 'authorized',
        proximoPagamento: '2026-09-06T12:00:00Z',
        valorCentavos: 2490,
      },
    });

    const r = await svc.sincronizarDoProvedor('pre-1');
    expect(r).toMatchObject({ householdId: 'fam-1', status: STATUS.ATIVA, ignorado: false });

    const sub = armazem.docs['households/fam-1'].subscription;
    expect(sub.status).toBe(STATUS.ATIVA);
    expect(sub.currentPeriodEnd.toDate().toISOString()).toBe('2026-09-06T12:00:00.000Z');
    expect(sub.activatedAt).toBe(AGORA_FALSO);
  });

  it('não reescreve a data da primeira ativação', async () => {
    armazem.docs['households/fam-1'].subscription.activatedAt = '<ativou-em-junho>';
    const svc = servicoCom({
      buscarAssinatura: { id: 'pre-1', householdId: 'fam-1', status: STATUS.ATIVA, statusDoProvedor: 'authorized' },
    });

    await svc.sincronizarDoProvedor('pre-1');
    expect(armazem.docs['households/fam-1'].subscription.activatedAt).toBe('<ativou-em-junho>');
  });

  it('ignora preapproval sem external_reference', async () => {
    const svc = servicoCom({ buscarAssinatura: { id: 'pre-x', householdId: null, status: STATUS.ATIVA } });
    expect(await svc.sincronizarDoProvedor('pre-x')).toMatchObject({ ignorado: true, motivo: 'SEM_EXTERNAL_REFERENCE' });
  });

  it('ignora família que não existe', async () => {
    const svc = servicoCom({ buscarAssinatura: { id: 'pre-x', householdId: 'fam-fantasma', status: STATUS.ATIVA } });
    expect(await svc.sincronizarDoProvedor('pre-x')).toMatchObject({ ignorado: true, motivo: 'FAMILIA_INEXISTENTE' });
  });

  it('status desconhecido não muda nada — falha fechada', async () => {
    const svc = servicoCom({
      buscarAssinatura: { id: 'pre-1', householdId: 'fam-1', status: null, statusDoProvedor: 'coisa_nova' },
    });

    expect(await svc.sincronizarDoProvedor('pre-1')).toMatchObject({ ignorado: true, motivo: 'STATUS_DESCONHECIDO' });
    expect(armazem.docs['households/fam-1'].subscription.status).toBe(STATUS.TRIAL);
  });

  it('cancelamento vindo do provedor carimba a data', async () => {
    const svc = servicoCom({
      buscarAssinatura: { id: 'pre-1', householdId: 'fam-1', status: STATUS.CANCELADA, statusDoProvedor: 'cancelled' },
    });
    await svc.sincronizarDoProvedor('pre-1');
    expect(armazem.docs['households/fam-1'].subscription.canceledAt).toBe(AGORA_FALSO);
  });
});

describe('pagamento do ciclo', () => {
  const assinaturaAtiva = {
    id: 'pre-1', householdId: 'fam-1', status: STATUS.ATIVA, statusDoProvedor: 'authorized',
    proximoPagamento: '2026-09-06T12:00:00Z',
  };

  it('pagamento processado confirma o mês', async () => {
    const svc = servicoCom({
      buscarAssinatura: assinaturaAtiva,
      buscarPagamentoAutorizado: { id: 99, assinaturaId: 'pre-1', status: 'processed', pagamentoStatus: 'approved', valorCentavos: 2490 },
    });

    const r = await svc.registrarPagamento(99);
    expect(r).toMatchObject({ householdId: 'fam-1', status: 'processed', duplicado: false });

    const sub = armazem.docs['households/fam-1'].subscription;
    expect(sub.status).toBe(STATUS.ATIVA);
    expect(sub.lastPaymentAt).toBe(AGORA_FALSO);
  });

  it('a reentrega do mesmo webhook não conta duas vezes', async () => {
    const svc = servicoCom({
      buscarAssinatura: assinaturaAtiva,
      buscarPagamentoAutorizado: { id: 99, assinaturaId: 'pre-1', status: 'processed', valorCentavos: 2490 },
    });

    await svc.registrarPagamento(99);
    const segunda = await svc.registrarPagamento(99);

    expect(segunda).toMatchObject({ duplicado: true });
    const eventos = Object.keys(armazem.docs).filter((k) => k.includes('billingEvents/pagamento-'));
    expect(eventos).toHaveLength(1);
  });

  it('cobrança em retentativa coloca a assinatura em atraso', async () => {
    const svc = servicoCom({
      buscarAssinatura: assinaturaAtiva,
      buscarPagamentoAutorizado: { id: 100, assinaturaId: 'pre-1', status: 'recycling', valorCentavos: 2490 },
    });

    await svc.registrarPagamento(100);
    expect(armazem.docs['households/fam-1'].subscription.status).toBe(STATUS.ATRASADA);
  });

  it('pagamento sem assinatura vinculada é ignorado', async () => {
    const svc = servicoCom({ buscarPagamentoAutorizado: { id: 1, assinaturaId: null } });
    expect(await svc.registrarPagamento(1)).toMatchObject({ ignorado: true, motivo: 'SEM_ASSINATURA' });
  });
});

describe('cancelamento pelo cliente', () => {
  it('cancela no provedor antes de marcar no banco', async () => {
    const cliente = fakeCliente({});
    const svc = criarServicoDeAssinatura({ db: fakeDb(), admin: fakeAdmin, cliente });
    armazem.docs['households/fam-1'].subscription.externalId = 'pre-1';

    await svc.cancelar('fam-1', { motivo: 'caro demais' });

    expect(cliente().chamadas).toContainEqual(['cancelarAssinatura', 'pre-1']);
    const sub = armazem.docs['households/fam-1'].subscription;
    expect(sub.status).toBe(STATUS.CANCELADA);
    expect(sub.cancelReason).toBe('caro demais');
  });

  it('cancela localmente mesmo sem assinatura no provedor (só trial)', async () => {
    const cliente = fakeCliente({});
    const svc = criarServicoDeAssinatura({ db: fakeDb(), admin: fakeAdmin, cliente });

    await svc.cancelar('fam-1');
    expect(cliente().chamadas.some(([m]) => m === 'cancelarAssinatura')).toBe(false);
    expect(armazem.docs['households/fam-1'].subscription.status).toBe(STATUS.CANCELADA);
  });
});

describe('ações administrativas (painel do operador, nunca do cliente)', () => {
  it('pagamento manual ativa sem falar com o provedor e marca provider: manual', async () => {
    const cliente = fakeCliente({});
    const svc = criarServicoDeAssinatura({ db: fakeDb(), admin: fakeAdmin, cliente });

    await svc.registrarPagamentoManual('fam-1', { diasDeAcesso: 30, motivo: 'pix direto', registradoPor: 'admin-1' });

    expect(cliente().chamadas).toHaveLength(0);
    const sub = armazem.docs['households/fam-1'].subscription;
    expect(sub.status).toBe(STATUS.ATIVA);
    expect(sub.provider).toBe('manual');
    expect(sub.currentPeriodEnd.toDate).toBeTypeOf('function');

    const chaveDoEvento = Object.keys(armazem.docs).find((k) => k.startsWith('households/fam-1/billingEvents/manual-'));
    expect(armazem.docs[chaveDoEvento]).toMatchObject({
      tipo: 'pagamento_manual', motivo: 'pix direto', registradoPor: 'admin-1',
    });
  });

  it('marcarComoInterna ativa com preço zero e plano interno', async () => {
    const svc = criarServicoDeAssinatura({ db: fakeDb(), admin: fakeAdmin, cliente: fakeCliente({}) });

    await svc.marcarComoInterna('fam-1', { registradoPor: 'admin-1' });

    const sub = armazem.docs['households/fam-1'].subscription;
    expect(sub).toMatchObject({ status: STATUS.ATIVA, plan: 'interno', priceCents: 0 });
  });

  it('desmarcarInterna devolve a família ao plano normal', async () => {
    const svc = criarServicoDeAssinatura({ db: fakeDb(), admin: fakeAdmin, cliente: fakeCliente({}) });

    await svc.marcarComoInterna('fam-1');
    await svc.desmarcarInterna('fam-1');

    expect(armazem.docs['households/fam-1'].subscription.plan).toBe('familia');
  });

  it('bloquear grava o motivo e desbloquear reabre o acesso', async () => {
    const svc = criarServicoDeAssinatura({ db: fakeDb(), admin: fakeAdmin, cliente: fakeCliente({}) });

    await svc.bloquear('fam-1', { motivo: 'chargeback', registradoPor: 'admin-1' });
    let sub = armazem.docs['households/fam-1'].subscription;
    expect(sub.adminOverride).toMatchObject({ blocked: true, reason: 'chargeback', blockedBy: 'admin-1' });

    await svc.desbloquear('fam-1', { registradoPor: 'admin-1' });
    sub = armazem.docs['households/fam-1'].subscription;
    expect(sub.adminOverride.blocked).toBe(false);
  });

  it('toda ação administrativa fica registrada em billingEvents', async () => {
    const svc = criarServicoDeAssinatura({ db: fakeDb(), admin: fakeAdmin, cliente: fakeCliente({}) });

    await svc.bloquear('fam-1', { motivo: 'teste' });
    const eventos = Object.keys(armazem.docs).filter((k) => k.includes('billingEvents/bloqueio-'));
    expect(eventos).toHaveLength(1);
  });
});
