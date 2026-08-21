import { describe, it, expect } from 'vitest';
import { criarApenasOperadorAtivo, PAPEIS } from './operador.js';

/**
 * `buscarOperador` entra como dublê — nunca o Firestore real, que a trava de
 * firebaseAdmin.js recusa carregar sob teste sem emulador.
 *
 * O que estes testes protegem: um ATENDENTE não pode virar administrador por
 * acidente, e um operador desligado não pode continuar atendendo. As duas
 * coisas falhariam em silêncio — a pessoa continuaria trabalhando normalmente
 * e ninguém notaria até o estrago.
 */

function criarRes() {
  const res = { statusCode: null, body: null };
  res.status = (codigo) => { res.statusCode = codigo; return res; };
  res.json = (corpo) => { res.body = corpo; return res; };
  return res;
}

function rodar(middleware, req) {
  const res = criarRes();
  const resultado = { chamouNext: false, erro: null };

  return middleware(req, res, (err) => {
    if (err) resultado.erro = err;
    else resultado.chamouNext = true;
  }).then(() => ({ res, ...resultado }));
}

const OPERADOR_ATIVO = { nome: 'Kirk', papel: PAPEIS.ADMIN, ativo: true };

describe('apenasOperadorAtivo', () => {
  it('recusa quando o authMiddleware não rodou antes (sem userId)', async () => {
    const middleware = criarApenasOperadorAtivo(async () => {
      throw new Error('não deveria consultar o banco');
    });

    const { res, chamouNext } = await rodar(middleware, {});

    expect(chamouNext).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('recusa uid que não tem registro em operadores', async () => {
    const middleware = criarApenasOperadorAtivo(async () => null);

    const { res, chamouNext } = await rodar(middleware, { userId: 'uid-de-cliente' });

    expect(chamouNext).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.codigo).toBe('NAO_E_OPERADOR');
  });

  it('recusa operador desligado', async () => {
    const middleware = criarApenasOperadorAtivo(async () => ({
      nome: 'Ex-atendente', papel: PAPEIS.ATENDENTE, ativo: false,
    }));

    const { res, chamouNext } = await rodar(middleware, { userId: 'uid-1' });

    expect(chamouNext).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.codigo).toBe('OPERADOR_INATIVO');
  });

  it('recusa registro SEM o campo ativo — não libera por omissão', async () => {
    const middleware = criarApenasOperadorAtivo(async () => ({ nome: 'Meio cadastrado' }));

    const { res, chamouNext } = await rodar(middleware, { userId: 'uid-2' });

    expect(chamouNext).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('recusa ativo em formato frouxo (a string "true" não é true)', async () => {
    const middleware = criarApenasOperadorAtivo(async () => ({ nome: 'X', ativo: 'true' }));

    const { chamouNext, res } = await rodar(middleware, { userId: 'uid-3' });

    expect(chamouNext).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('deixa passar operador ativo e preenche req.operador', async () => {
    const middleware = criarApenasOperadorAtivo(async () => OPERADOR_ATIVO);
    const req = { userId: 'uid-do-kirk' };

    const { chamouNext } = await rodar(middleware, req);

    expect(chamouNext).toBe(true);
    expect(req.operador).toEqual({
      uid: 'uid-do-kirk', nome: 'Kirk', papel: PAPEIS.ADMIN, ativo: true,
    });
  });

  it('consulta o operador pelo uid do token, nunca por algo do corpo', async () => {
    let consultado = null;
    const middleware = criarApenasOperadorAtivo(async (uid) => {
      consultado = uid;
      return OPERADOR_ATIVO;
    });

    await rodar(middleware, {
      userId: 'uid-do-token',
      body: { uid: 'uid-que-eu-quero-ser' },
      query: { uid: 'outro-ainda' },
    });

    expect(consultado).toBe('uid-do-token');
  });

  it('papel ausente ou desconhecido vira ATENDENTE — menor privilégio', async () => {
    const semPapel = criarApenasOperadorAtivo(async () => ({ nome: 'A', ativo: true }));
    const reqA = { userId: 'uid-a' };
    await rodar(semPapel, reqA);
    expect(reqA.operador.papel).toBe(PAPEIS.ATENDENTE);

    const papelInventado = criarApenasOperadorAtivo(async () => ({
      nome: 'B', ativo: true, papel: 'DONO_DE_TUDO',
    }));
    const reqB = { userId: 'uid-b' };
    await rodar(papelInventado, reqB);
    expect(reqB.operador.papel).toBe(PAPEIS.ATENDENTE);
  });

  it('não deixa campo extra do documento vazar para req.operador', async () => {
    const middleware = criarApenasOperadorAtivo(async () => ({
      ...OPERADOR_ATIVO, senhaAntiga: 'nao-deveria-existir', interno: { qualquer: 'coisa' },
    }));
    const req = { userId: 'uid-1' };

    await rodar(middleware, req);

    expect(Object.keys(req.operador).sort()).toEqual(['ativo', 'nome', 'papel', 'uid']);
  });

  it('erro ao ler o banco vira erro, nunca liberação', async () => {
    const middleware = criarApenasOperadorAtivo(async () => {
      throw new Error('Firestore fora do ar');
    });

    const { chamouNext, erro, res } = await rodar(middleware, { userId: 'uid-1' });

    expect(chamouNext).toBe(false);
    expect(erro).toBeInstanceOf(Error);
    expect(res.statusCode).toBeNull();
  });
});
