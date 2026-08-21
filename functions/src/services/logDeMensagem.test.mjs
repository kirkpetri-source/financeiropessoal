import { describe, it, expect, beforeEach } from 'vitest';
import { criarEscopo } from '../data/escopo.js';
import { criarLogUnico, idDoLog } from './logDeMensagem.js';

/**
 * O dublê de banco tem uma folga assíncrona de propósito.
 *
 * `get()` só devolve o resultado no microtask seguinte, e `create()` também
 * espera um tique antes de conferir — mas confere e grava SEM soltar o
 * processador, que é a garantia que o Firestore dá de verdade. É essa
 * combinação que reproduz a corrida: duas execuções conseguem ler "não existe"
 * ao mesmo tempo, e mesmo assim só uma consegue criar.
 */
const estado = { documentos: {}, autoId: 0 };

function fakeQuery(colecao, filtros = []) {
  return {
    where(campo, op, valor) { return fakeQuery(colecao, [...filtros, { campo, valor }]); },
    orderBy() { return fakeQuery(colecao, filtros); },
    limit() { return fakeQuery(colecao, filtros); },
    async get() {
      await Promise.resolve();
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
      async add(dados) {
        await Promise.resolve();
        const id = `auto-${++estado.autoId}`;
        estado.documentos[`${nome}/${id}`] = dados;
        return { id, async get() { return { id, data: () => estado.documentos[`${nome}/${id}`] }; } };
      },
      doc(id) {
        return {
          id,
          async get() {
            await Promise.resolve();
            const dados = estado.documentos[`${nome}/${id}`];
            return { exists: !!dados, id, data: () => dados };
          },
          async create(dados) {
            await Promise.resolve();
            // Confere e grava sem ceder o processador — é isto que o `create()`
            // do Firestore garante e que a conferência em código nunca teve.
            if (estado.documentos[`${nome}/${id}`]) {
              throw Object.assign(new Error('already exists'), { code: 6 });
            }
            estado.documentos[`${nome}/${id}`] = dados;
          },
          async update(dados) { Object.assign(estado.documentos[`${nome}/${id}`], dados); },
        };
      },
    };
  },
};

const fakeAdmin = { firestore: { FieldValue: { serverTimestamp: () => '<agora>' } } };
const escopoDe = criarEscopo(fakeDb, fakeAdmin);

const FAMILIA = 'fam-1';
const OUTRA = 'fam-2';
const MSG = '3EB0C767D26B8A1F1A2B';

function mensagem(messageId = MSG, extra = {}) {
  return {
    messageId,
    groupId: '5564999990001@s.whatsapp.net',
    sender: 'Kirk',
    messageType: 'TEXT',
    content: 'gastei 45 no mercado',
    processingStatus: 'PENDING',
    ...extra,
  };
}

function logsGravados(householdId) {
  return Object.entries(estado.documentos)
    .filter(([chave]) => chave.startsWith('whatsappLogs/'))
    .map(([chave, dados]) => ({ id: chave.slice('whatsappLogs/'.length), ...dados }))
    .filter((doc) => !householdId || doc.householdId === householdId);
}

beforeEach(() => {
  estado.documentos = {};
  estado.autoId = 0;
});

describe('idDoLog', () => {
  it('deriva o id do messageId, com a família na frente', () => {
    expect(idDoLog(FAMILIA, MSG)).toBe(`${FAMILIA}__${MSG}`);
  });

  it('troca a barra, que o Firestore recusa em id de documento', () => {
    expect(idDoLog(FAMILIA, 'ABC/DEF')).toBe(`${FAMILIA}__ABC_DEF`);
    expect(idDoLog(FAMILIA, 'ABC/DEF')).not.toContain('/');
  });

  it('não deixa o messageId crescer sem limite', () => {
    const id = idDoLog(FAMILIA, 'X'.repeat(5000));
    expect(id.length).toBeLessThanOrEqual(FAMILIA.length + 2 + 200);
  });

  it('devolve null sem família ou sem messageId — não há o que deduplicar', () => {
    expect(idDoLog(FAMILIA, '')).toBeNull();
    expect(idDoLog(FAMILIA, null)).toBeNull();
    expect(idDoLog('', MSG)).toBeNull();
  });

  it('nunca casa com o padrão reservado do Firestore (__algo__)', () => {
    expect(idDoLog(FAMILIA, '__id__')).toBe(`${FAMILIA}____id__`);
    expect(/^__.*__$/.test(idDoLog(FAMILIA, '__id__'))).toBe(false);
  });
});

describe('criarLogUnico', () => {
  it('grava o log e devolve o id derivado da mensagem', async () => {
    const { log, criado } = await criarLogUnico(escopoDe(FAMILIA), mensagem());

    expect(criado).toBe(true);
    expect(log.id).toBe(`${FAMILIA}__${MSG}`);
    expect(logsGravados()).toHaveLength(1);
  });

  it('carimba a família no documento', async () => {
    await criarLogUnico(escopoDe(FAMILIA), mensagem());
    expect(logsGravados()[0].householdId).toBe(FAMILIA);
  });

  it('a segunda entrega da mesma mensagem não grava nada', async () => {
    const primeira = await criarLogUnico(escopoDe(FAMILIA), mensagem());
    const segunda = await criarLogUnico(escopoDe(FAMILIA), mensagem());

    expect(primeira.criado).toBe(true);
    expect(segunda.criado).toBe(false);
    expect(segunda.log).toBeNull();
    expect(logsGravados()).toHaveLength(1);
  });

  it('duas entregas SIMULTÂNEAS criam um log só — a corrida', async () => {
    const dados = escopoDe(FAMILIA);

    const [webhook, polling] = await Promise.all([
      criarLogUnico(dados, mensagem()),
      criarLogUnico(dados, mensagem()),
    ]);

    expect([webhook.criado, polling.criado].filter(Boolean)).toHaveLength(1);
    expect(logsGravados()).toHaveLength(1);
  });

  it('a conferência em dois tempos — a que existia antes — duplicaria aqui', async () => {
    // Prova que o dublê reproduz a corrida de verdade: com o mesmo banco, o
    // "pergunta se já existe, depois grava" cria os dois logs.
    const dados = escopoDe(FAMILIA);

    async function jeitoAntigo() {
      const snap = await dados.consultar('whatsappLogs').where('messageId', '==', MSG).limit(1).get();
      if (!snap.empty) return false;
      await dados.criar('whatsappLogs', mensagem());
      return true;
    }

    const resultado = await Promise.all([jeitoAntigo(), jeitoAntigo()]);

    expect(resultado.filter(Boolean)).toHaveLength(2);
    expect(logsGravados()).toHaveLength(2);
  });

  it('famílias diferentes com o mesmo messageId não se atrapalham', async () => {
    const uma = await criarLogUnico(escopoDe(FAMILIA), mensagem());
    const outra = await criarLogUnico(escopoDe(OUTRA), mensagem());

    expect(uma.criado).toBe(true);
    expect(outra.criado).toBe(true);
    expect(logsGravados(FAMILIA)).toHaveLength(1);
    expect(logsGravados(OUTRA)).toHaveLength(1);
  });

  it('linhas diferentes da mesma mensagem são logs diferentes', async () => {
    // O polling quebra a mensagem em linhas e deduplica cada uma sozinha.
    const dados = escopoDe(FAMILIA);
    const a = await criarLogUnico(dados, mensagem(`${MSG}_line0`));
    const b = await criarLogUnico(dados, mensagem(`${MSG}_line1`));

    expect(a.criado).toBe(true);
    expect(b.criado).toBe(true);
    expect(logsGravados()).toHaveLength(2);
  });

  it('sem messageId, grava com id automático em vez de perder a mensagem', async () => {
    const { log, criado } = await criarLogUnico(escopoDe(FAMILIA), mensagem(null));

    expect(criado).toBe(true);
    expect(log.id).toMatch(/^auto-/);
    expect(logsGravados()).toHaveLength(1);
  });

  it('log já cancelado continua barrando o reprocessamento', async () => {
    // Cancelar um lançamento marca o log como CANCELLED e NÃO o apaga, de
    // propósito: apagado, o polling reencontraria a mensagem no histórico e
    // lançaria de novo.
    const dados = escopoDe(FAMILIA);
    const { log } = await criarLogUnico(dados, mensagem());
    await dados.atualizar('whatsappLogs', log.id, { processingStatus: 'CANCELLED' });

    const relido = await criarLogUnico(dados, mensagem());

    expect(relido.criado).toBe(false);
    expect(logsGravados()).toHaveLength(1);
  });
});
