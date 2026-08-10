import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { webhookAuth, comparaSegredo } from './webhookAuth.js';

function criarRes() {
  const res = { statusCode: null, body: null };
  res.status = (codigo) => { res.statusCode = codigo; return res; };
  res.json = (corpo) => { res.body = corpo; return res; };
  return res;
}

describe('webhookAuth', () => {
  const original = process.env.EVOLUTION_WEBHOOK_TOKEN;

  beforeEach(() => {
    process.env.EVOLUTION_WEBHOOK_TOKEN = 'segredo-de-teste';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.EVOLUTION_WEBHOOK_TOKEN;
    else process.env.EVOLUTION_WEBHOOK_TOKEN = original;
  });

  it('falha fechada quando o segredo não está configurado no ambiente', () => {
    delete process.env.EVOLUTION_WEBHOOK_TOKEN;
    const req = { params: { token: 'qualquer-coisa' }, ip: '1.2.3.4' };
    const res = criarRes();
    let chamouNext = false;

    webhookAuth(req, res, () => { chamouNext = true; });

    expect(chamouNext).toBe(false);
    expect(res.statusCode).toBe(503);
  });

  it('recusa quando o token da URL não bate com o segredo', () => {
    const req = { params: { token: 'token-errado' }, ip: '1.2.3.4' };
    const res = criarRes();
    let chamouNext = false;

    webhookAuth(req, res, () => { chamouNext = true; });

    expect(chamouNext).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('recusa quando não vem token nenhum na URL', () => {
    const req = { params: {}, ip: '1.2.3.4' };
    const res = criarRes();
    let chamouNext = false;

    webhookAuth(req, res, () => { chamouNext = true; });

    expect(chamouNext).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('aceita quando o token da URL bate com o segredo configurado', () => {
    const req = { params: { token: 'segredo-de-teste' }, ip: '1.2.3.4' };
    const res = criarRes();
    let chamouNext = false;

    webhookAuth(req, res, () => { chamouNext = true; });

    expect(chamouNext).toBe(true);
    expect(res.statusCode).toBeNull();
  });
});

describe('comparaSegredo', () => {
  it('devolve true só para strings idênticas', () => {
    expect(comparaSegredo('abc123', 'abc123')).toBe(true);
  });

  it('devolve false para strings diferentes, mesmo com o mesmo tamanho', () => {
    expect(comparaSegredo('abc123', 'abc124')).toBe(false);
  });

  it('devolve false para tamanhos diferentes, sem lançar erro', () => {
    expect(comparaSegredo('abc', 'abcdef')).toBe(false);
  });
});
