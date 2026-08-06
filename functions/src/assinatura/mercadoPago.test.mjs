import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  assinaturaDoWebhookConfere,
  criarClienteMercadoPago,
  traduzirStatus,
  centavosParaReais,
  TOLERANCIA_ASSINATURA_MS,
} from './mercadoPago.js';
import { STATUS } from './estado.js';

const SEGREDO = 'segredo-de-teste';
const AGORA = Date.parse('2026-08-06T12:00:00Z');

function assinar({ dataId, requestId, ts, segredo = SEGREDO }) {
  const manifesto = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac('sha256', segredo).update(manifesto).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

/** fetch dublê: registra as chamadas e devolve o que o teste mandar. */
function fakeFetch(respostas) {
  const chamadas = [];
  const fn = async (url, opcoes) => {
    chamadas.push({ url, ...opcoes, corpo: opcoes?.body ? JSON.parse(opcoes.body) : null });
    const r = respostas.shift() || { ok: true, status: 200, corpo: {} };
    return {
      ok: r.ok !== false,
      status: r.status || 200,
      text: async () => JSON.stringify(r.corpo ?? {}),
    };
  };
  fn.chamadas = chamadas;
  return fn;
}

describe('assinatura do webhook', () => {
  const ts = Math.floor(AGORA / 1000);
  const base = { dataId: '2c9380848', requestId: 'req-1', ts };

  it('aceita assinatura correta', () => {
    const r = assinaturaDoWebhookConfere({
      assinatura: assinar(base), requestId: 'req-1', dataId: '2c9380848', segredo: SEGREDO, agora: AGORA,
    });
    expect(r.ok).toBe(true);
  });

  it('recusa quando o segredo não está configurado — falha fechada', () => {
    const r = assinaturaDoWebhookConfere({
      assinatura: assinar(base), requestId: 'req-1', dataId: '2c9380848', segredo: '', agora: AGORA,
    });
    expect(r).toMatchObject({ ok: false, motivo: 'SEGREDO_AUSENTE' });
  });

  it('recusa assinatura feita com outro segredo', () => {
    const r = assinaturaDoWebhookConfere({
      assinatura: assinar({ ...base, segredo: 'outro' }),
      requestId: 'req-1', dataId: '2c9380848', segredo: SEGREDO, agora: AGORA,
    });
    expect(r).toMatchObject({ ok: false, motivo: 'ASSINATURA_INVALIDA' });
  });

  it('recusa quando o id do corpo não é o id assinado', () => {
    const r = assinaturaDoWebhookConfere({
      assinatura: assinar(base), requestId: 'req-1', dataId: 'id-trocado', segredo: SEGREDO, agora: AGORA,
    });
    expect(r.ok).toBe(false);
  });

  it('recusa quando o request-id não bate', () => {
    const r = assinaturaDoWebhookConfere({
      assinatura: assinar(base), requestId: 'req-outro', dataId: '2c9380848', segredo: SEGREDO, agora: AGORA,
    });
    expect(r.ok).toBe(false);
  });

  it('recusa carimbo antigo — bloqueia replay', () => {
    const r = assinaturaDoWebhookConfere({
      assinatura: assinar(base), requestId: 'req-1', dataId: '2c9380848', segredo: SEGREDO,
      agora: AGORA + TOLERANCIA_ASSINATURA_MS + 1000,
    });
    expect(r).toMatchObject({ ok: false, motivo: 'CARIMBO_FORA_DA_JANELA' });
  });

  it('recusa cabeçalho ausente ou malformado', () => {
    expect(assinaturaDoWebhookConfere({ segredo: SEGREDO, dataId: 'x', agora: AGORA }).ok).toBe(false);
    expect(assinaturaDoWebhookConfere({
      assinatura: 'lixo', requestId: 'r', dataId: 'x', segredo: SEGREDO, agora: AGORA,
    })).toMatchObject({ ok: false, motivo: 'CABECALHO_MALFORMADO' });
  });

  it('casa id em maiúsculas com o manifesto em minúsculas', () => {
    const r = assinaturaDoWebhookConfere({
      assinatura: assinar({ ...base, dataId: 'ABCdef' }),
      requestId: 'req-1', dataId: 'ABCdef', segredo: SEGREDO, agora: AGORA,
    });
    expect(r.ok).toBe(true);
  });
});

describe('tradução de status', () => {
  it('mapeia os status do provedor', () => {
    expect(traduzirStatus('authorized')).toBe(STATUS.ATIVA);
    expect(traduzirStatus('pending')).toBe(STATUS.PENDENTE);
    expect(traduzirStatus('paused')).toBe(STATUS.PAUSADA);
    expect(traduzirStatus('cancelled')).toBe(STATUS.CANCELADA);
  });

  it('status desconhecido vira null, não vira ativo', () => {
    expect(traduzirStatus('coisa_nova')).toBeNull();
    expect(traduzirStatus(undefined)).toBeNull();
  });
});

describe('conversão de valor', () => {
  it('centavos viram reais sem erro de ponto flutuante', () => {
    expect(centavosParaReais(2490)).toBe(24.9);
    expect(centavosParaReais(100)).toBe(1);
    expect(centavosParaReais(1)).toBe(0.01);
  });
});

describe('cliente', () => {
  it('sem access token, recusa em vez de chamar a API', async () => {
    const cliente = criarClienteMercadoPago({ accessToken: null, fetchImpl: fakeFetch([]) });
    await expect(cliente.buscarAssinatura('123')).rejects.toMatchObject({ statusCode: 503 });
  });

  it('cria assinatura mandando householdId em external_reference', async () => {
    const fetchImpl = fakeFetch([{ corpo: { id: 'pre-1', init_point: 'https://mp/pagar', status: 'pending' } }]);
    const cliente = criarClienteMercadoPago({ accessToken: 'token', fetchImpl });

    const r = await cliente.criarAssinatura({
      householdId: 'fam-1', email: 'kirk@exemplo.com', urlDeRetorno: 'https://app/assinatura',
    });

    expect(r).toMatchObject({ id: 'pre-1', linkDePagamento: 'https://mp/pagar', status: STATUS.PENDENTE });

    const chamada = fetchImpl.chamadas[0];
    expect(chamada.url).toContain('/preapproval');
    expect(chamada.corpo.external_reference).toBe('fam-1');
    expect(chamada.corpo.auto_recurring).toMatchObject({
      frequency: 1, frequency_type: 'months', transaction_amount: 24.9, currency_id: 'BRL',
    });
    expect(chamada.headers['X-Idempotency-Key']).toBeTruthy();
  });

  it('exige householdId e e-mail antes de chamar a API', async () => {
    const fetchImpl = fakeFetch([]);
    const cliente = criarClienteMercadoPago({ accessToken: 'token', fetchImpl });

    await expect(cliente.criarAssinatura({ email: 'a@b.c' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(cliente.criarAssinatura({ householdId: 'fam-1' })).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchImpl.chamadas).toHaveLength(0);
  });

  it('busca assinatura e normaliza os campos que importam', async () => {
    const fetchImpl = fakeFetch([{
      corpo: {
        id: 'pre-1',
        external_reference: 'fam-1',
        status: 'authorized',
        next_payment_date: '2026-09-06T12:00:00.000-04:00',
        auto_recurring: { transaction_amount: 24.9 },
      },
    }]);
    const cliente = criarClienteMercadoPago({ accessToken: 'token', fetchImpl });

    const r = await cliente.buscarAssinatura('pre-1');
    expect(r).toMatchObject({
      id: 'pre-1',
      householdId: 'fam-1',
      status: STATUS.ATIVA,
      valorCentavos: 2490,
    });
    expect(r.proximoPagamento).toBe('2026-09-06T12:00:00.000-04:00');
  });

  it('erro 4xx do provedor vira 400; 5xx vira 502', async () => {
    const cliente400 = criarClienteMercadoPago({
      accessToken: 'token', fetchImpl: fakeFetch([{ ok: false, status: 404, corpo: { message: 'não achei' } }]),
    });
    await expect(cliente400.buscarAssinatura('x')).rejects.toMatchObject({ statusCode: 400 });

    const cliente500 = criarClienteMercadoPago({
      accessToken: 'token', fetchImpl: fakeFetch([{ ok: false, status: 500, corpo: {} }]),
    });
    await expect(cliente500.buscarAssinatura('x')).rejects.toMatchObject({ statusCode: 502 });
  });

  it('cancelar manda status cancelled por PUT', async () => {
    const fetchImpl = fakeFetch([{ corpo: { id: 'pre-1', status: 'cancelled' } }]);
    const cliente = criarClienteMercadoPago({ accessToken: 'token', fetchImpl });

    const r = await cliente.cancelarAssinatura('pre-1');
    expect(r.status).toBe(STATUS.CANCELADA);
    expect(fetchImpl.chamadas[0].method).toBe('PUT');
    expect(fetchImpl.chamadas[0].corpo).toEqual({ status: 'cancelled' });
  });

  it('busca pagamento autorizado e liga ao id da assinatura', async () => {
    const fetchImpl = fakeFetch([{
      corpo: { id: 99, preapproval_id: 'pre-1', status: 'processed', transaction_amount: 24.9, payment: { status: 'approved' } },
    }]);
    const cliente = criarClienteMercadoPago({ accessToken: 'token', fetchImpl });

    const r = await cliente.buscarPagamentoAutorizado(99);
    expect(r).toMatchObject({ assinaturaId: 'pre-1', status: 'processed', pagamentoStatus: 'approved', valorCentavos: 2490 });
  });
});
