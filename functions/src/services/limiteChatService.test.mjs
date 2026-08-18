import { describe, it, expect, beforeEach } from 'vitest';
import { criarLimiteChatService } from './limiteChatService.js';
import { criarLimiteIAService } from './limiteIAService.js';

const estado = { documentos: {} };

const fakeDb = {
  collection(nome) {
    return {
      doc(id) {
        return {
          id,
          async get() {
            const dados = estado.documentos[`${nome}/${id}`];
            return { exists: !!dados, id, data: () => dados };
          },
        };
      },
    };
  },
  async runTransaction(fn) {
    return fn({
      async get(ref) { return ref.get(); },
      set(ref, dados) {
        const chave = `whatsappConfigs/${ref.id}`;
        estado.documentos[chave] = { ...(estado.documentos[chave] || {}), ...dados };
      },
    });
  },
};

const fakeAdmin = { firestore: { FieldValue: { serverTimestamp: () => '<agora>' } } };

beforeEach(() => {
  estado.documentos = {};
  delete process.env.LIMITE_DIARIO_CHAT;
  delete process.env.LIMITE_DIARIO_IA;
});

describe('limiteChatService', () => {
  it('padrão é 20 conversas por dia', () => {
    const { limite } = criarLimiteChatService({ db: fakeDb, admin: fakeAdmin });
    expect(limite).toBe(20);
  });

  it('consome e bloqueia ao atingir o teto', async () => {
    process.env.LIMITE_DIARIO_CHAT = '2';
    const svc = criarLimiteChatService({ db: fakeDb, admin: fakeAdmin });

    expect((await svc.consumir('fam-1')).permitido).toBe(true);
    expect((await svc.consumir('fam-1')).permitido).toBe(true);
    expect((await svc.consumir('fam-1')).permitido).toBe(false);
  });

  it('não mistura contagem entre famílias', async () => {
    process.env.LIMITE_DIARIO_CHAT = '1';
    const svc = criarLimiteChatService({ db: fakeDb, admin: fakeAdmin });

    expect((await svc.consumir('fam-1')).permitido).toBe(true);
    expect((await svc.consumir('fam-1')).permitido).toBe(false);
    expect((await svc.consumir('fam-2')).permitido).toBe(true);
  });

  describe('consultarUso — alimenta a porcentagem do painel', () => {
    it('não consome ao consultar', async () => {
      process.env.LIMITE_DIARIO_CHAT = '10';
      const svc = criarLimiteChatService({ db: fakeDb, admin: fakeAdmin });

      await svc.consumir('fam-1');
      await svc.consultarUso('fam-1');
      await svc.consultarUso('fam-1');

      expect((await svc.consultarUso('fam-1')).usadas).toBe(1);
    });

    it('devolve porcentagem, não contagem crua', async () => {
      process.env.LIMITE_DIARIO_CHAT = '4';
      const svc = criarLimiteChatService({ db: fakeDb, admin: fakeAdmin });

      await svc.consumir('fam-1');
      expect((await svc.consultarUso('fam-1')).percentual).toBe(25);

      await svc.consumir('fam-1');
      expect((await svc.consultarUso('fam-1')).percentual).toBe(50);
    });

    it('família que nunca conversou está em zero', async () => {
      const svc = criarLimiteChatService({ db: fakeDb, admin: fakeAdmin });
      const uso = await svc.consultarUso('fam-nova');

      expect(uso).toMatchObject({ usadas: 0, percentual: 0, esgotado: false });
    });
  });

  // A garantia mais importante deste serviço: lançar é a função principal do
  // produto e não pode ser consumida por uma tarde de perguntas.
  describe('cota de conversa NÃO consome a de lançamento', () => {
    it('esgotar o chat deixa o lançamento por IA intacto', async () => {
      process.env.LIMITE_DIARIO_CHAT = '1';
      process.env.LIMITE_DIARIO_IA = '2';

      const chat = criarLimiteChatService({ db: fakeDb, admin: fakeAdmin });
      const ia = criarLimiteIAService({ db: fakeDb, admin: fakeAdmin });

      expect((await chat.consumir('fam-1')).permitido).toBe(true);
      expect((await chat.consumir('fam-1')).permitido).toBe(false); // chat esgotado

      // Lançar continua funcionando normalmente.
      expect(await ia.verificarLimiteDeIA('fam-1')).toBe(true);
      expect(await ia.verificarLimiteDeIA('fam-1')).toBe(true);
    });

    it('esgotar o lançamento deixa o chat intacto', async () => {
      process.env.LIMITE_DIARIO_CHAT = '2';
      process.env.LIMITE_DIARIO_IA = '1';

      const chat = criarLimiteChatService({ db: fakeDb, admin: fakeAdmin });
      const ia = criarLimiteIAService({ db: fakeDb, admin: fakeAdmin });

      expect(await ia.verificarLimiteDeIA('fam-1')).toBe(true);
      expect(await ia.verificarLimiteDeIA('fam-1')).toBe(false);

      expect((await chat.consumir('fam-1')).permitido).toBe(true);
    });
  });

  describe('virada do dia segue o Brasil', () => {
    it('não reseta às 21h de Brasília', async () => {
      process.env.LIMITE_DIARIO_CHAT = '1';
      const svc = criarLimiteChatService({ db: fakeDb, admin: fakeAdmin });

      // 18h BRT (21h UTC)
      expect((await svc.consumir('fam-1', new Date('2026-08-18T21:00:00Z'))).permitido).toBe(true);
      // 22h BRT = 01h UTC do dia seguinte: para o servidor virou, para o usuário não.
      expect((await svc.consumir('fam-1', new Date('2026-08-19T01:00:00Z'))).permitido).toBe(false);
    });

    it('reseta na meia-noite de Brasília', async () => {
      process.env.LIMITE_DIARIO_CHAT = '1';
      const svc = criarLimiteChatService({ db: fakeDb, admin: fakeAdmin });

      expect((await svc.consumir('fam-1', new Date('2026-08-18T21:00:00Z'))).permitido).toBe(true);
      expect((await svc.consumir('fam-1', new Date('2026-08-19T03:01:00Z'))).permitido).toBe(true);
    });
  });

  describe('mensagem de limite', () => {
    const svc = () => criarLimiteChatService({ db: fakeDb, admin: fakeAdmin });

    it('informa a data exata do retorno', () => {
      const msg = svc().mensagemDeLimite(new Date('2026-08-18T15:00:00Z'));
      expect(msg).toContain('19/08');
      expect(msg).toContain('meia-noite');
      expect(msg).toContain('Brasília');
    });

    it('atravessa a virada de mês', () => {
      expect(svc().mensagemDeLimite(new Date('2026-08-31T15:00:00Z'))).toContain('01/09');
    });

    // O ponto da mensagem não é avisar que acabou — é garantir que ninguém
    // fique sem saber como registrar um gasto agora.
    it('ensina o caminho que continua aberto e sem limite', () => {
      const msg = svc().mensagemDeLimite();
      expect(msg).toContain('gastei 84,90 no mercado');
      expect(msg).toContain('não passam por IA e não têm limite');
    });
  });
});
