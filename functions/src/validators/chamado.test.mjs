import { describe, it, expect } from 'vitest';
import { apenasNumeroDeChamado, aberturaSchema, respostaSchema } from './chamado.js';

function rodar(numero) {
  const req = { params: { numero } };
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };

  let passou = false;
  apenasNumeroDeChamado(req, res, () => { passou = true; });

  return { passou, status: res.statusCode, body: res.body };
}

describe('apenasNumeroDeChamado', () => {
  it('deixa passar número de chamado de verdade', () => {
    for (const n of ['1', '42', '9999']) expect(rodar(n).passou).toBe(true);
  });

  it('recusa caminho com barra — vira ID de documento no Firestore', () => {
    // Sem isto, `String(numero)` com barra faz o SDK recusar com
    // "documentPath must point to a document", e o errorHandler devolve essa
    // mensagem interna num 500. Não é travessia (o Firestore não resolve `..`),
    // mas a resposta certa é 404.
    for (const n of ['a/b', '../2', 'a/b/c/d', '1/2']) {
      const r = rodar(n);
      expect(r.passou).toBe(false);
      expect(r.status).toBe(404);
    }
  });

  it('recusa texto, vazio e ausente', () => {
    for (const n of ['abc', '', undefined, '__proto__', '1abc', '-1', '0']) {
      expect(rodar(n).passou).toBe(false);
    }
  });

  it('a recusa é indistinguível de "não existe"', () => {
    expect(rodar('a/b').body).toEqual({ error: 'Chamado não encontrado.' });
  });
});

describe('schemas — o corpo não decide quem é quem', () => {
  const valido = { assunto: 'teste', categoria: 'DUVIDA', texto: 'oi' };

  it('recusa householdId no corpo em voz alta, em vez de ignorar', () => {
    expect(aberturaSchema.safeParse({ ...valido, householdId: 'fam-alheia' }).success).toBe(false);
  });

  it('recusa autor forjado', () => {
    expect(aberturaSchema.safeParse({ ...valido, autor: 'SUPORTE' }).success).toBe(false);
    expect(respostaSchema.safeParse({ texto: 'oi', autor: 'SUPORTE' }).success).toBe(false);
  });

  it('recusa autorNome forjado — senão qualquer um assina como "Suporte"', () => {
    expect(respostaSchema.safeParse({ texto: 'oi', autorNome: 'Suporte RevelaCash' }).success).toBe(false);
  });

  it('recusa status e numero vindos do corpo', () => {
    expect(aberturaSchema.safeParse({ ...valido, status: 'RESOLVIDO' }).success).toBe(false);
    expect(aberturaSchema.safeParse({ ...valido, numero: 1 }).success).toBe(false);
  });

  it('anexos só aceita lista de caminhos, com teto', () => {
    expect(aberturaSchema.safeParse({ ...valido, anexos: ['chamados/x/y.png'] }).success).toBe(true);
    expect(aberturaSchema.safeParse({ ...valido, anexos: Array(6).fill('x') }).success).toBe(false);
    expect(aberturaSchema.safeParse({ ...valido, anexos: [{ storagePath: 'x' }] }).success).toBe(false);
  });
});
