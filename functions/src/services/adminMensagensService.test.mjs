import { describe, it, expect, vi } from 'vitest';
import { criarServicoDeMensagens } from './adminMensagensService.js';

/**
 * Firestore, config do canal e envio de WhatsApp dublados por injeção. O que
 * estes testes protegem: família sem canal ativo não derruba o broadcast
 * (fica registrada como erro no resultado), o destino certo é escolhido por
 * modo (grupo x individual), e o histórico grava o que de fato aconteceu.
 */

function criarAmbiente({ configs = {}, respostas = {} } = {}) {
  let seq = 0;
  const colecoes = {};
  const chamadasDeEnvio = [];

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
            async update(dados) { m.set(id, { ...m.get(id), ...dados }); },
            async delete() { m.delete(id); },
          };
        },
        async get() {
          return { docs: [...m.entries()].map(([id, dados]) => ({ id, data: () => dados })) };
        },
      };
    },
  };

  const admin = {
    firestore: {
      FieldValue: { serverTimestamp: () => ({ toMillis: () => ++seq, toDate: () => new Date(seq) }) },
    },
  };

  const getRawConfig = vi.fn(async (householdId) => configs[householdId] ?? null);

  const enviarWhatsapp = vi.fn(async (householdId, config, destino, texto) => {
    chamadasDeEnvio.push({ householdId, destino, texto });
    const resposta = respostas[householdId];
    if (resposta) return resposta;
    return { enviado: true, messageId: `msg-${householdId}` };
  });

  return {
    servico: criarServicoDeMensagens({ db, admin, getRawConfig, enviarWhatsapp }),
    chamadasDeEnvio,
  };
}

describe('templates', () => {
  it('recusa tipo inválido', async () => {
    const { servico } = criarAmbiente();
    await expect(servico.salvarTemplate({ titulo: 'x', tipo: 'inventado', texto: 'y', criadoPor: 'op' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('cria e depois atualiza pelo id', async () => {
    const { servico } = criarAmbiente();
    const criado = await servico.salvarTemplate({ titulo: 'Aviso de vencimento', tipo: 'aviso', texto: 'Seu plano vence em breve', criadoPor: 'op' });
    expect(criado.id).toBeTruthy();

    const atualizado = await servico.salvarTemplate({ id: criado.id, titulo: 'Aviso de vencimento (novo)', tipo: 'aviso', texto: 'texto novo' });
    expect(atualizado.titulo).toBe('Aviso de vencimento (novo)');

    const lista = await servico.listarTemplates();
    expect(lista).toHaveLength(1);
  });

  it('atualizar id inexistente dá 404', async () => {
    const { servico } = criarAmbiente();
    await expect(servico.salvarTemplate({ id: 'nao-existe', titulo: 'x', tipo: 'dica', texto: 'y' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('apaga template', async () => {
    const { servico } = criarAmbiente();
    const criado = await servico.salvarTemplate({ titulo: 'x', tipo: 'dica', texto: 'y', criadoPor: 'op' });
    await servico.apagarTemplate(criado.id);
    expect(await servico.listarTemplates()).toHaveLength(0);
  });
});

describe('enviarBroadcast', () => {
  it('família sem canal ativo vira erro no resultado, sem derrubar as outras', async () => {
    const { servico, chamadasDeEnvio } = criarAmbiente({
      configs: {
        'fam-ok': { enabled: true, modo: 'individual', ownerJid: '5564999999999@s.whatsapp.net' },
        'fam-sem-canal': { enabled: false },
        'fam-nunca-configurou': null,
      },
    });

    const resultado = await servico.enviarBroadcast({
      familias: [{ id: 'fam-ok' }, { id: 'fam-sem-canal' }, { id: 'fam-nunca-configurou' }],
      texto: 'Novidade no app!',
      tipo: 'novidade',
      assunto: 'Lançamento',
      segmento: 'todas',
      criadoPor: 'operador@revelacash.internal',
    });

    expect(resultado.totalDestinatarios).toBe(3);
    expect(resultado.totalOk).toBe(1);
    expect(resultado.totalErro).toBe(2);
    expect(resultado.resultados.find((r) => r.householdId === 'fam-sem-canal').erro).toMatch(/desativado/);
    expect(resultado.resultados.find((r) => r.householdId === 'fam-nunca-configurou').erro).toMatch(/desativado/);
    expect(chamadasDeEnvio).toHaveLength(1);
  });

  it('usa groupId no modo grupo e ownerJid no modo individual', async () => {
    const { servico, chamadasDeEnvio } = criarAmbiente({
      configs: {
        'fam-grupo': { enabled: true, modo: 'grupo', groupId: '120363@g.us', ownerJid: 'nao-deveria-usar' },
        'fam-individual': { enabled: true, modo: 'individual', ownerJid: '5564999999999@s.whatsapp.net' },
      },
    });

    await servico.enviarBroadcast({
      familias: [{ id: 'fam-grupo' }, { id: 'fam-individual' }],
      texto: 'oi', tipo: 'aviso', criadoPor: 'op',
    });

    expect(chamadasDeEnvio.find((c) => c.householdId === 'fam-grupo').destino).toBe('120363@g.us');
    expect(chamadasDeEnvio.find((c) => c.householdId === 'fam-individual').destino).toBe('5564999999999@s.whatsapp.net');
  });

  it('recusa mensagem vazia e público vazio', async () => {
    const { servico } = criarAmbiente();
    await expect(servico.enviarBroadcast({ familias: [{ id: 'x' }], texto: '   ', criadoPor: 'op' }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(servico.enviarBroadcast({ familias: [], texto: 'oi', criadoPor: 'op' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('registra o broadcast no histórico', async () => {
    const { servico } = criarAmbiente({
      configs: { 'fam-1': { enabled: true, modo: 'individual', ownerJid: 'x@s.whatsapp.net' } },
    });
    await servico.enviarBroadcast({ familias: [{ id: 'fam-1' }], texto: 'oi', tipo: 'dica', criadoPor: 'op' });

    const historico = await servico.listarBroadcasts();
    expect(historico).toHaveLength(1);
    expect(historico[0].totalOk).toBe(1);
  });
});

describe('enviarParaFamilia', () => {
  it('propaga erro do envio como 502 e ainda assim registra o histórico', async () => {
    const { servico } = criarAmbiente({
      configs: { 'fam-1': { enabled: true, modo: 'individual', ownerJid: 'x@s.whatsapp.net' } },
      respostas: { 'fam-1': { enviado: false, erro: 'Evolution API 500' } },
    });

    await expect(servico.enviarParaFamilia({ householdId: 'fam-1', texto: 'oi', criadoPor: 'op' }))
      .rejects.toMatchObject({ statusCode: 502 });

    const historico = await servico.listarBroadcasts();
    expect(historico).toHaveLength(1);
    expect(historico[0].totalErro).toBe(1);
  });

  it('envia com sucesso quando o canal está pronto', async () => {
    const { servico } = criarAmbiente({
      configs: { 'fam-1': { enabled: true, modo: 'individual', ownerJid: 'x@s.whatsapp.net' } },
    });

    const resultado = await servico.enviarParaFamilia({ householdId: 'fam-1', texto: 'oi', criadoPor: 'op' });
    expect(resultado.ok).toBe(true);
  });
});
