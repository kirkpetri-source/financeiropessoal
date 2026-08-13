import { describe, it, expect } from 'vitest';
import { criarServicoDeCrm } from './adminCrmService.js';

/**
 * Firestore dublado por injeção, nada de rede/banco real. O que estes testes
 * protegem: nota some com a família certa, nota de outra família não aparece
 * (nem pode ser apagada) na lista de quem não é dona dela.
 */

function criarAmbiente() {
  let seq = 0;
  const colecoes = {};

  function mapa(nome) {
    if (!colecoes[nome]) colecoes[nome] = new Map();
    return colecoes[nome];
  }

  const db = {
    collection(nome) {
      const m = mapa(nome);
      return {
        async add(dados) {
          const id = `id-${++seq}`;
          m.set(id, dados);
          return { id, async get() { return { id, data: () => m.get(id) }; } };
        },
        doc(id) {
          return {
            id,
            async get() { return { id, exists: m.has(id), data: () => m.get(id) }; },
            async delete() { m.delete(id); },
          };
        },
        where(campo, _op, valor) {
          return {
            async get() {
              const docs = [...m.entries()]
                .filter(([, dados]) => dados[campo] === valor)
                .map(([id, dados]) => ({ id, data: () => dados }));
              return { docs };
            },
          };
        },
      };
    },
  };

  const admin = {
    firestore: {
      FieldValue: { serverTimestamp: () => ({ toMillis: () => ++seq, toDate: () => new Date(seq) }) },
    },
  };

  return { servico: criarServicoDeCrm({ db, admin }) };
}

describe('adminCrmService', () => {
  it('lista notas só da família pedida, mais recente primeiro', async () => {
    const { servico } = criarAmbiente();
    await servico.adicionarNota('fam-1', { texto: 'primeira', criadoPor: 'op' });
    await servico.adicionarNota('fam-2', { texto: 'de outra família', criadoPor: 'op' });
    await servico.adicionarNota('fam-1', { texto: 'segunda', criadoPor: 'op' });

    const notas = await servico.listarNotas('fam-1');
    expect(notas.map((n) => n.texto)).toEqual(['segunda', 'primeira']);
  });

  it('recusa nota vazia', async () => {
    const { servico } = criarAmbiente();
    await expect(servico.adicionarNota('fam-1', { texto: '   ', criadoPor: 'op' })).rejects.toThrow();
  });

  it('não apaga nota de outra família', async () => {
    const { servico } = criarAmbiente();
    const nota = await servico.adicionarNota('fam-1', { texto: 'x', criadoPor: 'op' });

    await expect(servico.apagarNota('fam-2', nota.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(await servico.listarNotas('fam-1')).toHaveLength(1);
  });

  it('apaga a própria nota', async () => {
    const { servico } = criarAmbiente();
    const nota = await servico.adicionarNota('fam-1', { texto: 'x', criadoPor: 'op' });

    await servico.apagarNota('fam-1', nota.id);
    expect(await servico.listarNotas('fam-1')).toHaveLength(0);
  });
});
