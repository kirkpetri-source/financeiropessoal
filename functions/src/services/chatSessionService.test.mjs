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

  // A ação pendente mora aqui, no servidor, e não na memória do modelo: é o
  // que impede a assistente de executar uma alteração que ela não propôs.
  describe('ação pendente de escrita', () => {
    const ACAO = { tipo: 'ALTERAR', transactionId: 't1', alteracao: { categoryId: 'cat-lazer' } };

    it('começa sem nada pendente', async () => {
      expect(await svc.lerAcaoPendente(escopoDe(FAMILIA), KIRK)).toBeNull();
    });

    it('guarda e devolve a proposta', async () => {
      const dados = escopoDe(FAMILIA);
      await svc.definirAcaoPendente(dados, KIRK, ACAO);

      expect(await svc.lerAcaoPendente(dados, KIRK)).toMatchObject(ACAO);
    });

    it('funciona mesmo sem conversa anterior', async () => {
      // Primeira coisa que a pessoa faz é pedir uma alteração: não há sessão
      // criada ainda, e isso não pode falhar.
      const dados = escopoDe(FAMILIA);
      await svc.definirAcaoPendente(dados, 'alguem-novo', ACAO);

      expect(await svc.lerAcaoPendente(dados, 'alguem-novo')).toMatchObject(ACAO);
    });

    it('limpar remove a proposta', async () => {
      const dados = escopoDe(FAMILIA);
      await svc.definirAcaoPendente(dados, KIRK, ACAO);
      await svc.limparAcaoPendente(dados, KIRK);

      expect(await svc.lerAcaoPendente(dados, KIRK)).toBeNull();
    });

    it('a proposta de uma pessoa não vaza para outra da mesma família', async () => {
      const dados = escopoDe(FAMILIA);
      await svc.definirAcaoPendente(dados, KIRK, ACAO);

      expect(await svc.lerAcaoPendente(dados, RAQUEL)).toBeNull();
    });

    it('a proposta não vaza entre famílias', async () => {
      await svc.definirAcaoPendente(escopoDe(FAMILIA), KIRK, ACAO);
      expect(await svc.lerAcaoPendente(escopoDe('fam-2'), KIRK)).toBeNull();
    });

    it('não atropela o histórico já gravado', async () => {
      const dados = escopoDe(FAMILIA);
      await svc.registrarTroca(dados, KIRK, { pergunta: 'p', resposta: 'r' });
      await svc.definirAcaoPendente(dados, KIRK, ACAO);

      expect(await svc.historico(dados, KIRK)).toHaveLength(2);
      expect(await svc.lerAcaoPendente(dados, KIRK)).toMatchObject(ACAO);
    });
  });
});

describe('esperandoResposta — a Nina perguntou algo', () => {
  const PEDIDO_DE_DADOS = 'Para cadastrar a Internet como conta fixa, preciso de duas '
    + 'informações: qual é o valor mensal? E qual é o dia do vencimento? '
    + 'Assim que me passar, eu cadastro.';

  it('marca a espera quando a resposta tem pergunta', async () => {
    const dados = escopoDe(FAMILIA);
    await svc.registrarTroca(dados, KIRK, {
      pergunta: 'cadastra minha internet como conta fixa',
      resposta: PEDIDO_DE_DADOS,
    });

    expect(await svc.esperandoResposta(dados, KIRK)).toBe(true);
  });

  it('resposta afirmativa não deixa espera nenhuma', async () => {
    const dados = escopoDe(FAMILIA);
    await svc.registrarTroca(dados, KIRK, {
      pergunta: 'quanto gastei esse mes',
      resposta: 'Você gastou R$ 2.381,17 em agosto.',
    });

    expect(await svc.esperandoResposta(dados, KIRK)).toBe(false);
  });

  it('a espera vence — depois disso a mensagem volta a ser lançamento', async () => {
    const dados = escopoDe(FAMILIA);
    await svc.registrarTroca(dados, KIRK, { pergunta: 'p', resposta: 'Qual o valor?' });

    relogio = new Date(relogio.getTime() + 11 * 60 * 1000);

    expect(await svc.esperandoResposta(dados, KIRK)).toBe(false);
  });

  it('a troca seguinte sem pergunta encerra a espera', async () => {
    const dados = escopoDe(FAMILIA);
    await svc.registrarTroca(dados, KIRK, { pergunta: 'p', resposta: 'Qual o dia do vencimento?' });
    await svc.registrarTroca(dados, KIRK, { pergunta: 'dia 10', resposta: 'Conta fixa cadastrada.' });

    expect(await svc.esperandoResposta(dados, KIRK)).toBe(false);
  });

  it('a espera é de quem foi perguntado, não da família inteira', async () => {
    const dados = escopoDe(FAMILIA);
    await svc.registrarTroca(dados, KIRK, { pergunta: 'p', resposta: 'Qual o valor?' });

    expect(await svc.esperandoResposta(dados, RAQUEL)).toBe(false);
  });

  it('sem conversa nenhuma, não há espera', async () => {
    expect(await svc.esperandoResposta(escopoDe(FAMILIA), KIRK)).toBe(false);
  });
});
