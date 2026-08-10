import { describe, it, expect } from 'vitest';
import { criarAuthMiddleware } from './auth.js';

/**
 * `verificarToken` entra como dublê — nunca o Admin SDK real, que a trava de
 * firebaseAdmin.js recusa carregar sob teste sem emulador.
 */

function criarRes() {
  const res = { statusCode: null, body: null };
  res.status = (codigo) => { res.statusCode = codigo; return res; };
  res.json = (corpo) => { res.body = corpo; return res; };
  return res;
}

describe('authMiddleware', () => {
  it('recusa quando não há header Authorization', async () => {
    const middleware = criarAuthMiddleware(async () => { throw new Error('não deveria chamar'); });
    const req = { headers: {} };
    const res = criarRes();
    let chamouNext = false;

    await middleware(req, res, () => { chamouNext = true; });

    expect(chamouNext).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('recusa header sem o prefixo Bearer', async () => {
    const middleware = criarAuthMiddleware(async () => { throw new Error('não deveria chamar'); });
    const req = { headers: { authorization: 'Basic abc123' } };
    const res = criarRes();
    let chamouNext = false;

    await middleware(req, res, () => { chamouNext = true; });

    expect(chamouNext).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('recusa token que o verificador rejeita (inválido/expirado)', async () => {
    const middleware = criarAuthMiddleware(async () => { throw new Error('token expirado'); });
    const req = { headers: { authorization: 'Bearer token-invalido' } };
    const res = criarRes();
    let chamouNext = false;

    await middleware(req, res, () => { chamouNext = true; });

    expect(chamouNext).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('aceita token válido e popula req.userId/userEmail/userClaims', async () => {
    const decoded = { uid: 'user-1', email: 'kirk@exemplo.com', email_verified: true, admin: true };
    const middleware = criarAuthMiddleware(async (token) => {
      expect(token).toBe('token-valido');
      return decoded;
    });
    const req = { headers: { authorization: 'Bearer token-valido' } };
    const res = criarRes();
    let chamouNext = false;

    await middleware(req, res, () => { chamouNext = true; });

    expect(chamouNext).toBe(true);
    expect(req.userId).toBe('user-1');
    expect(req.userEmail).toBe('kirk@exemplo.com');
    expect(req.userEmailVerificado).toBe(true);
    expect(req.userClaims).toBe(decoded);
  });

  it('marca userEmailVerificado como false quando o token não confirma o e-mail', async () => {
    const decoded = { uid: 'user-2', email: 'novo@exemplo.com', email_verified: false };
    const middleware = criarAuthMiddleware(async () => decoded);
    const req = { headers: { authorization: 'Bearer token-valido' } };
    const res = criarRes();

    await middleware(req, res, () => {});

    expect(req.userEmailVerificado).toBe(false);
  });
});
