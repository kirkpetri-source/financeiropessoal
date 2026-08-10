import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { criarAppCheckMiddleware } from './appCheck.js';

function criarRes() {
  const res = { statusCode: null, body: null };
  res.status = (codigo) => { res.statusCode = codigo; return res; };
  res.json = (corpo) => { res.body = corpo; return res; };
  return res;
}

function fakeAdmin(verifyToken) {
  return { appCheck: () => ({ verifyToken }) };
}

describe('appCheckMiddleware', () => {
  const original = process.env.APP_CHECK_ENFORCE;

  afterEach(() => {
    if (original === undefined) delete process.env.APP_CHECK_ENFORCE;
    else process.env.APP_CHECK_ENFORCE = original;
  });

  it('deixa passar direto quando APP_CHECK_ENFORCE não está ligado (padrão)', async () => {
    delete process.env.APP_CHECK_ENFORCE;
    const middleware = criarAppCheckMiddleware(fakeAdmin(async () => { throw new Error('não deveria chamar'); }));
    const req = { headers: {} };
    const res = criarRes();
    let chamouNext = false;

    await middleware(req, res, () => { chamouNext = true; });

    expect(chamouNext).toBe(true);
    expect(res.statusCode).toBeNull();
  });

  describe('com APP_CHECK_ENFORCE=true', () => {
    beforeEach(() => { process.env.APP_CHECK_ENFORCE = 'true'; });

    it('recusa quando o header não vem', async () => {
      const middleware = criarAppCheckMiddleware(fakeAdmin(async () => { throw new Error('não deveria chamar'); }));
      const req = { headers: {} };
      const res = criarRes();
      let chamouNext = false;

      await middleware(req, res, () => { chamouNext = true; });

      expect(chamouNext).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it('recusa token que o Admin SDK rejeita', async () => {
      const middleware = criarAppCheckMiddleware(fakeAdmin(async () => { throw new Error('token inválido'); }));
      const req = { headers: { 'x-firebase-appcheck': 'token-ruim' } };
      const res = criarRes();
      let chamouNext = false;

      await middleware(req, res, () => { chamouNext = true; });

      expect(chamouNext).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it('deixa passar com token válido', async () => {
      const middleware = criarAppCheckMiddleware(fakeAdmin(async (token) => {
        expect(token).toBe('token-bom');
        return { appId: 'app-1' };
      }));
      const req = { headers: { 'x-firebase-appcheck': 'token-bom' } };
      const res = criarRes();
      let chamouNext = false;

      await middleware(req, res, () => { chamouNext = true; });

      expect(chamouNext).toBe(true);
      expect(res.statusCode).toBeNull();
    });
  });
});
