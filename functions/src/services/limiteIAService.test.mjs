import { describe, it, expect, beforeEach } from 'vitest';
import { criarLimiteIAService } from './limiteIAService.js';

/**
 * Teto diário de chamadas de IA por família. `db` é um dublê em memória com
 * runTransaction síncrono o suficiente para o teste — não precisa reproduzir
 * concorrência real do Firestore, só o contrato de leitura+escrita atômica.
 */

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
    const tx = {
      async get(ref) { return ref.get(); },
      set(ref, dados) {
        const chave = `whatsappConfigs/${ref.id}`;
        estado.documentos[chave] = { ...(estado.documentos[chave] || {}), ...dados };
      },
    };
    return fn(tx);
  },
};

const fakeAdmin = { firestore: { FieldValue: { serverTimestamp: () => '<agora>' } } };

beforeEach(() => {
  estado.documentos = {};
  delete process.env.LIMITE_DIARIO_IA;
});

describe('verificarLimiteDeIA', () => {
  it('permite e conta a primeira chamada do dia', async () => {
    const { verificarLimiteDeIA } = criarLimiteIAService({ db: fakeDb, admin: fakeAdmin });
    const permitido = await verificarLimiteDeIA('fam-1');

    expect(permitido).toBe(true);
    expect(estado.documentos['whatsappConfigs/fam-1'].iaContagemDiaria).toBe(1);
  });

  it('bloqueia ao atingir o limite configurado', async () => {
    process.env.LIMITE_DIARIO_IA = '3';
    const { verificarLimiteDeIA } = criarLimiteIAService({ db: fakeDb, admin: fakeAdmin });

    expect(await verificarLimiteDeIA('fam-1')).toBe(true);
    expect(await verificarLimiteDeIA('fam-1')).toBe(true);
    expect(await verificarLimiteDeIA('fam-1')).toBe(true);
    expect(await verificarLimiteDeIA('fam-1')).toBe(false);

    expect(estado.documentos['whatsappConfigs/fam-1'].iaContagemDiaria).toBe(3);
  });

  it('não mistura contagem entre famílias diferentes', async () => {
    process.env.LIMITE_DIARIO_IA = '1';
    const { verificarLimiteDeIA } = criarLimiteIAService({ db: fakeDb, admin: fakeAdmin });

    expect(await verificarLimiteDeIA('fam-1')).toBe(true);
    expect(await verificarLimiteDeIA('fam-1')).toBe(false);
    // fam-2 tem o próprio teto, intacto.
    expect(await verificarLimiteDeIA('fam-2')).toBe(true);
  });

  it('reseta a contagem num dia diferente do salvo', async () => {
    process.env.LIMITE_DIARIO_IA = '1';
    const { verificarLimiteDeIA } = criarLimiteIAService({ db: fakeDb, admin: fakeAdmin });

    expect(await verificarLimiteDeIA('fam-1')).toBe(true);
    expect(await verificarLimiteDeIA('fam-1')).toBe(false);

    // Simula virada de dia: contagem salva é de "ontem".
    estado.documentos['whatsappConfigs/fam-1'].iaContagemData = '2000-01-01';
    expect(await verificarLimiteDeIA('fam-1')).toBe(true);
  });

  it('usa o limite padrão quando LIMITE_DIARIO_IA não está definido', async () => {
    const { limite } = criarLimiteIAService({ db: fakeDb, admin: fakeAdmin });
    expect(limite).toBe(60);
  });
});
