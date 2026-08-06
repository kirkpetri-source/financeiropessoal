import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { handleMercadoPagoWebhook, extrairTipo, extrairId } from './mercadoPagoWebhook.js';

/**
 * O webhook é a única porta pela qual alguém vira assinante. Estes testes
 * cobrem só os caminhos que NÃO tocam o Firestore — recusa, sonda e tipo
 * ignorado. O processamento de verdade é testado em assinaturaService.test.mjs,
 * com o banco dublado.
 */

const SEGREDO = 'segredo-de-teste';

function resposta() {
  const r = { statusCode: null, corpo: null };
  r.status = (codigo) => { r.statusCode = codigo; return r; };
  r.json = (corpo) => { r.corpo = corpo; return r; };
  return r;
}

function requisicao({ headers = {}, body = {}, query = {} } = {}) {
  return { headers, body, query, ip: '1.2.3.4' };
}

function assinar(dataId, requestId, ts = Math.floor(Date.now() / 1000)) {
  const manifesto = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac('sha256', SEGREDO).update(manifesto).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

beforeEach(() => { process.env.MERCADOPAGO_WEBHOOK_SECRET = SEGREDO; });
afterEach(() => { delete process.env.MERCADOPAGO_WEBHOOK_SECRET; });

describe('extração dos campos', () => {
  it('pega o tipo do corpo, do topic ou da query', () => {
    expect(extrairTipo(requisicao({ body: { type: 'subscription_preapproval' } }))).toBe('subscription_preapproval');
    expect(extrairTipo(requisicao({ body: { topic: 'payment' } }))).toBe('payment');
    expect(extrairTipo(requisicao({ query: { type: 'x' } }))).toBe('x');
    expect(extrairTipo(requisicao())).toBeNull();
  });

  it('prefere o data.id da query, que é o id assinado', () => {
    const req = requisicao({ query: { 'data.id': 'da-query' }, body: { data: { id: 'do-corpo' } } });
    expect(extrairId(req)).toBe('da-query');
    expect(extrairId(requisicao({ body: { data: { id: 'do-corpo' } } }))).toBe('do-corpo');
  });
});

describe('sonda do painel do Mercado Pago', () => {
  it('responde 200 quando não há id nem assinatura', async () => {
    const res = resposta();
    await handleMercadoPagoWebhook(requisicao(), res);

    expect(res.statusCode).toBe(200);
    expect(res.corpo).toMatchObject({ verificacao: true });
  });

  it('a sonda não vira brecha: com id e sem assinatura, recusa', async () => {
    const res = resposta();
    await handleMercadoPagoWebhook(
      requisicao({ body: { type: 'subscription_preapproval', data: { id: 'pre-1' } } }),
      res
    );

    expect(res.statusCode).toBe(401);
  });

  it('com assinatura presente, mesmo sem id, ainda passa pela conferência', async () => {
    const res = resposta();
    await handleMercadoPagoWebhook(requisicao({ headers: { 'x-signature': 'ts=1,v1=abc' } }), res);

    expect(res.statusCode).toBe(401);
  });
});

describe('conferência da assinatura', () => {
  it('recusa assinatura forjada', async () => {
    const res = resposta();
    await handleMercadoPagoWebhook(requisicao({
      headers: { 'x-signature': 'ts=9999999999,v1=forjada', 'x-request-id': 'r1' },
      body: { type: 'subscription_preapproval', data: { id: 'pre-1' } },
    }), res);

    expect(res.statusCode).toBe(401);
  });

  it('recusa tudo quando o segredo não está configurado', async () => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;

    const res = resposta();
    await handleMercadoPagoWebhook(requisicao({
      headers: { 'x-signature': assinar('pre-1', 'r1'), 'x-request-id': 'r1' },
      body: { type: 'subscription_preapproval', data: { id: 'pre-1' } },
    }), res);

    expect(res.statusCode).toBe(401);
  });

  it('assinatura válida com tipo ignorado devolve 200 sem processar', async () => {
    const res = resposta();
    await handleMercadoPagoWebhook(requisicao({
      headers: { 'x-signature': assinar('pag-1', 'r1'), 'x-request-id': 'r1' },
      body: { type: 'payment', data: { id: 'pag-1' } },
    }), res);

    expect(res.statusCode).toBe(200);
    expect(res.corpo).toMatchObject({ ignorado: true, tipo: 'payment' });
  });
});
