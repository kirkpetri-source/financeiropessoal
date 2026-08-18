import { describe, it, expect, beforeEach } from 'vitest';
import { criarEscopo } from '../data/escopo.js';
import { criarChatSessionService, MAX_TROCAS } from './chatSessionService.js';

const estado = { documentos: {} };

function fakeQuery(colecao, filtros = []) {
  return {
    where(campo, op, valor) { return fakeQuery(colecao, [...filtros, { campo, op, valor }]); },
    orderBy() { return fakeQuery(colecao, filtros); },
    limit() { return fakeQuery(colecao, filtros); },
    async get() {
      const docs = Object.entries(estado.documentos)
        .filter(([chave]) => chave.startsWith(`${colecao}/`))
        .map(([chave, dados]) => ({ id: chave.slice(colecao.length + 1), data: () => dados }))
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
          async create(dados) {
            if (estado.documentos[`${nome}/${id}`]) {
              throw Object.assign(new Error('already exists'), { code: 6 });
            }
            estado.documentos[`${nome}/${id}`] = dados;
          },
          async update(dados) { Object.assign(estado.documentos[`${nome}/${id}`], dados); },
          async delete() { delete estado.documentos[`${nome}/${id}`]; },
        };
      },
    };
  },
};

const fakeAdmin = { firestore: { FieldValue: { serverTimestamp: () => '<agora>' } } };
const escopoDe = criarEscopo(fakeDb, fakeAdmin);

const FAMILIA = 'fam-1';
const KIRK = '5564999990001';
const RAQUEL = '5564999990002';

let relogio = new Date('2026-08-18T12:00:00Z');
const svc = criarChatSessionService({ agora: () => relogio });

beforeEach(() => {
  estado.documentos = {};
  relogio = new Date('2026-08-18T12:00:00Z');
});

describe('chatSessionService', () => {
  it('começa sem histórico', async () => {
    expect(await svc.historico(escopoDe(FAMILIA), KIRK)).toEqual([]);
  });

  it('guarda pergunta e resposta na ordem', async () => {
    const dados = escopoDe(FAMILIA);
    await svc.registrarTroca(dados, KIRK, { pergunta: 'quanto gastei?', resposta: 'R$ 1.000' });

    const h = await svc.historico(dados, KIRK);
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ papel: 'usuario', texto: 'quanto gastei?' });
    expect(h[1]).toMatchObject({ papel: 'assistente', texto: 'R$ 1.000' });
  });

  it('acumula trocas seguidas', async () => {
    const dados = escopoDe(FAMILIA);
    await svc.registrarTroca(dados, KIRK, { pergunta: 'p1', resposta: 'r1' });
    await svc.registrarTroca(dados, KIRK, { pergunta: 'p2', resposta: 'r2' });

    const h = await svc.historico(dados, KIRK);
    expect(h.map((m) => m.texto)).toEqual(['p1', 'r1', 'p2', 'r2']);
  });

  it('poda as trocas mais antigas ao passar do teto', async () => {
    const dados = escopoDe(FAMILIA);
    for (let i = 1; i <= MAX_TROCAS + 3; i += 1) {
      await svc.registrarTroca(dados, KIRK, { pergunta: `p${i}`, resposta: `r${i}` });
    }

    const h = await svc.historico(dados, KIRK);
    expect(h).toHaveLength(MAX_TROCAS * 2);
    expect(h[0].texto).toBe('p4');       // as três primeiras saíram
    expect(h.at(-1).texto).toBe(`r${MAX_TROCAS + 3}`);
  });

  // O caso que motiva a sessão ser por PESSOA e não por família: numa família
  // em modo grupo, o "e o mês passado?" do Kirk não pode continuar a conversa
  // que a Raquel estava tendo.
  describe('memória é por pessoa, não por família', () => {
    it('duas pessoas da mesma família têm conversas separadas', async () => {
      const dados = escopoDe(FAMILIA);

      await svc.registrarTroca(dados, KIRK, { pergunta: 'quanto gastei em mercado?', resposta: 'R$ 520' });
      await svc.registrarTroca(dados, RAQUEL, { pergunta: 'e a farmácia?', resposta: 'R$ 80' });

      const doKirk = await svc.historico(dados, KIRK);
      const daRaquel = await svc.historico(dados, RAQUEL);

      expect(doKirk.map((m) => m.texto)).toEqual(['quanto gastei em mercado?', 'R$ 520']);
      expect(daRaquel.map((m) => m.texto)).toEqual(['e a farmácia?', 'R$ 80']);
    });
  });

  describe('isolamento entre famílias', () => {
    it('mesma pessoa em famílias diferentes não compartilha conversa', async () => {
      await svc.registrarTroca(escopoDe(FAMILIA), KIRK, { pergunta: 'segredo da fam-1', resposta: 'ok' });

      const noutraFamilia = await svc.historico(escopoDe('fam-2'), KIRK);
      expect(noutraFamilia).toEqual([]);
    });
  });

  describe('expiração', () => {
    // O TTL do Firestore apaga em algum momento dentro de ~24h, não na hora.
    // Confiar só nele faria uma conversa de ontem continuar como se fosse de agora.
    it('conversa velha não volta, mesmo com o documento ainda no banco', async () => {
      const dados = escopoDe(FAMILIA);
      await svc.registrarTroca(dados, KIRK, { pergunta: 'ontem', resposta: 'resposta de ontem' });

      expect(await svc.historico(dados, KIRK)).toHaveLength(2);

      relogio = new Date('2026-08-19T12:00:00Z'); // 24h depois
      expect(await svc.historico(dados, KIRK)).toEqual([]);
    });

    it('conversa recente continua valendo', async () => {
      const dados = escopoDe(FAMILIA);
      await svc.registrarTroca(dados, KIRK, { pergunta: 'agora há pouco', resposta: 'ok' });

      relogio = new Date('2026-08-18T14:00:00Z'); // 2h depois
      expect(await svc.historico(dados, KIRK)).toHaveLength(2);
    });
  });

  describe('limpar', () => {
    it('esquece a conversa da pessoa', async () => {
      const dados = escopoDe(FAMILIA);
      await svc.registrarTroca(dados, KIRK, { pergunta: 'p', resposta: 'r' });

      await svc.limpar(dados, KIRK);
      expect(await svc.historico(dados, KIRK)).toEqual([]);
    });

    it('não reclama quando não há nada para limpar', async () => {
      await expect(svc.limpar(escopoDe(FAMILIA), 'ninguem')).resolves.toBeUndefined();
    });
  });

  describe('interlocutor com caracteres estranhos', () => {
    it('não quebra o ID do documento', async () => {
      const dados = escopoDe(FAMILIA);
      const esquisito = '55/64/9999@s.whatsapp.net';

      await svc.registrarTroca(dados, esquisito, { pergunta: 'p', resposta: 'r' });
      expect(await svc.historico(dados, esquisito)).toHaveLength(2);
    });
  });
});
