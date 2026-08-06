import { describe, it, expect, beforeEach } from 'vitest';
import { criarServicoDeInstancia, normalizarTelefone } from './instanciaService.js';

/**
 * Firestore, Evolution e householdService dublados por injeção.
 *
 * O que estes testes protegem: o limite de 8 pessoas por família (é o que
 * sustenta a cobrança), a não-duplicação de membro a cada sincronização, e a
 * ordem dos passos — criar grupo com o WhatsApp desconectado tem que falhar
 * com mensagem que o cliente entenda, não com erro obscuro da Evolution.
 */

let docs;
let membros;

const AGORA = '<agora>';

function fakeDb() {
  return {
    collection: () => ({
      doc: (id) => ({
        async get() { return { exists: !!docs[id], data: () => docs[id] }; },
        async set(dados, opcoes) {
          docs[id] = opcoes?.merge ? { ...(docs[id] || {}), ...dados } : dados;
          for (const [k, v] of Object.entries(docs[id])) {
            if (v === '<apagar>') delete docs[id][k];
          }
        },
      }),
    }),
  };
}

const fakeAdmin = {
  firestore: {
    FieldValue: { serverTimestamp: () => AGORA, delete: () => '<apagar>' },
  },
};

const householdFalso = {
  async listarMembros() { return membros; },
  async adicionarMembro(_id, m) { membros.push({ id: m.userId, name: m.nome, phone: m.telefone, role: m.papel }); },
};

function providerFalso(sobrescritas = {}) {
  const chamadas = [];
  const p = {
    async criarInstancia(_c, args) { chamadas.push(['criarInstancia', args]); return { criada: true, jaExistia: false }; },
    async obterQrCode() { chamadas.push(['obterQrCode']); return { conectada: false, qrcode: 'data:image/png;base64,AAA', pairingCode: null }; },
    async estadoDaConexao() { return { estado: 'open', conectada: true }; },
    async criarGrupo(_c, args) { chamadas.push(['criarGrupo', args]); return { groupId: '12036@g.us' }; },
    async linkDeConvite() { return { linkConvite: 'https://chat.whatsapp.com/ABC', codigo: 'ABC' }; },
    async participantesDoGrupo() { return []; },
    async desconectarInstancia() { chamadas.push(['desconectarInstancia']); return { desconectada: true }; },
    async apagarInstancia() { chamadas.push(['apagarInstancia']); return { apagada: true }; },
    ...sobrescritas,
  };
  p.chamadas = chamadas;
  return p;
}

function servicoCom(provider) {
  return criarServicoDeInstancia({
    db: fakeDb(),
    admin: fakeAdmin,
    provider,
    householdService: householdFalso,
    webhookUrl: 'https://api.exemplo/webhooks/evolution/segredo',
  });
}

const CONFIG = { evolutionApiUrl: 'https://evo.exemplo', apiKey: 'chave-do-servidor' };

beforeEach(() => {
  docs = {};
  membros = [{ id: 'dono', name: 'Kirk', phone: '5564999555364', role: 'owner' }];
});

describe('conectar', () => {
  it('cria a instância com nome derivado da família e devolve o QR', async () => {
    const p = providerFalso();
    const r = await servicoCom(p).conectar('fam-1', CONFIG);

    expect(r).toMatchObject({ conectada: false, instanceName: 'fam-fam-1' });
    expect(r.qrcode).toMatch(/^data:image\/png;base64,/);

    const [, args] = p.chamadas.find(([m]) => m === 'criarInstancia');
    expect(args.instanceName).toBe('fam-fam-1');
    expect(args.webhookUrl).toContain('/webhooks/evolution/');
  });

  it('não habilita o canal enquanto ninguém leu o QR', async () => {
    await servicoCom(providerFalso()).conectar('fam-1', CONFIG);
    expect(docs['fam-1'].enabled).toBeUndefined();
  });

  it('instância que já existe não vira erro', async () => {
    const p = providerFalso({ criarInstancia: async () => ({ criada: false, jaExistia: true }) });
    const r = await servicoCom(p).conectar('fam-1', CONFIG);
    expect(r.jaExistia).toBe(true);
  });

  it('se já estiver conectada, marca habilitada e não devolve QR', async () => {
    const p = providerFalso({ obterQrCode: async () => ({ conectada: true, qrcode: null }) });
    const r = await servicoCom(p).conectar('fam-1', CONFIG);

    expect(r.conectada).toBe(true);
    expect(docs['fam-1'].enabled).toBe(true);
  });
});

describe('status', () => {
  it('sem instância, a etapa é a primeira', async () => {
    expect(await servicoCom(providerFalso()).status('fam-1', CONFIG))
      .toMatchObject({ etapa: 'sem_instancia', conectada: false });
  });

  it('conectada e sem grupo, pede o grupo', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1' };
    expect(await servicoCom(providerFalso()).status('fam-1', CONFIG))
      .toMatchObject({ etapa: 'sem_grupo', conectada: true });
  });

  it('com grupo, está pronto', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1', groupId: '12036@g.us', groupInviteUrl: 'https://chat.whatsapp.com/ABC' };
    const s = await servicoCom(providerFalso()).status('fam-1', CONFIG);

    expect(s).toMatchObject({ etapa: 'pronto', temGrupo: true, maxMembros: 8 });
    expect(s.linkConvite).toBe('https://chat.whatsapp.com/ABC');
  });

  it('aguardando leitura quando a conexão não abriu', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1' };
    const p = providerFalso({ estadoDaConexao: async () => ({ estado: 'connecting', conectada: false }) });
    expect(await servicoCom(p).status('fam-1', CONFIG)).toMatchObject({ etapa: 'aguardando_leitura' });
  });
});

describe('criar grupo', () => {
  it('exige instância', async () => {
    await expect(servicoCom(providerFalso()).criarGrupoDaFamilia('fam-1', CONFIG, {}))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('exige conexão aberta, com mensagem que o cliente entende', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1' };
    const p = providerFalso({ estadoDaConexao: async () => ({ estado: 'close', conectada: false }) });

    await expect(servicoCom(p).criarGrupoDaFamilia('fam-1', CONFIG, {}))
      .rejects.toMatchObject({ statusCode: 409, codigo: 'NAO_CONECTADO' });
  });

  it('exige pelo menos um participante — o WhatsApp não cria grupo de um', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1' };

    await expect(servicoCom(providerFalso()).criarGrupoDaFamilia('fam-1', CONFIG, { telefones: [] }))
      .rejects.toMatchObject({ statusCode: 400, codigo: 'SEM_PARTICIPANTE' });

    // Telefone curto demais não conta como participante.
    await expect(servicoCom(providerFalso()).criarGrupoDaFamilia('fam-1', CONFIG, { telefones: ['123'] }))
      .rejects.toMatchObject({ codigo: 'SEM_PARTICIPANTE' });
  });

  it('manda os participantes normalizados para a Evolution', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1' };
    const p = providerFalso();

    await servicoCom(p).criarGrupoDaFamilia('fam-1', CONFIG, { telefones: ['(64) 99955-5364'] });

    const [, args] = p.chamadas.find(([m]) => m === 'criarGrupo');
    expect(args.participantes).toEqual(['5564999555364']);
  });

  it('cria com o nome da família e guarda o link de convite', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1' };
    const p = providerFalso();

    const r = await servicoCom(p).criarGrupoDaFamilia('fam-1', CONFIG, {
      nomeDaFamilia: 'Família Petri', telefones: ['64999555364'],
    });

    expect(r).toMatchObject({ groupId: '12036@g.us', jaExistia: false });
    expect(r.linkConvite).toBe('https://chat.whatsapp.com/ABC');
    expect(docs['fam-1'].groupId).toBe('12036@g.us');
    expect(docs['fam-1'].enabled).toBe(true);

    const [, args] = p.chamadas.find(([m]) => m === 'criarGrupo');
    expect(args.nome).toContain('Família Petri');
  });

  it('não cria um segundo grupo — devolve o que já existe', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1', groupId: 'ja-existe@g.us' };
    const p = providerFalso();

    const r = await servicoCom(p).criarGrupoDaFamilia('fam-1', CONFIG, {});

    expect(r).toMatchObject({ groupId: 'ja-existe@g.us', jaExistia: true });
    expect(p.chamadas.some(([m]) => m === 'criarGrupo')).toBe(false);
  });
});

describe('normalizarTelefone', () => {
  it('põe o DDI 55 em número brasileiro sem ele', () => {
    expect(normalizarTelefone('64999555364')).toBe('5564999555364');
    expect(normalizarTelefone('(64) 99955-5364')).toBe('5564999555364');
    expect(normalizarTelefone('6433211234')).toBe('556433211234');
  });

  it('não duplica o DDI de quem já mandou completo', () => {
    expect(normalizarTelefone('5564999555364')).toBe('5564999555364');
    expect(normalizarTelefone('+55 64 99955-5364')).toBe('5564999555364');
  });

  it('recusa o que não é telefone', () => {
    expect(normalizarTelefone('')).toBeNull();
    expect(normalizarTelefone('123')).toBeNull();
    expect(normalizarTelefone(null)).toBeNull();
    expect(normalizarTelefone('abc')).toBeNull();
  });
});

describe('sincronizar membros', () => {
  function comParticipantes(lista) {
    return providerFalso({ participantesDoGrupo: async () => lista });
  }

  it('exige grupo', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1' };
    await expect(servicoCom(providerFalso()).sincronizarMembros('fam-1', CONFIG))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('cadastra quem entrou no grupo', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1', groupId: 'g@g.us' };
    const p = comParticipantes([
      { telefone: '5564999555364', nome: 'Kirk' },
      { telefone: '5564988887777', nome: 'Raquel' },
    ]);

    const r = await servicoCom(p).sincronizarMembros('fam-1', CONFIG);

    expect(r).toMatchObject({ participantes: 2, novos: 1, excedentes: 0 });
    expect(membros.find((m) => m.phone === '5564988887777')).toMatchObject({ name: 'Raquel', role: 'member' });
  });

  it('não duplica membro em sincronizações seguidas', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1', groupId: 'g@g.us' };
    const p = comParticipantes([{ telefone: '5564988887777', nome: 'Raquel' }]);
    const svc = servicoCom(p);

    await svc.sincronizarMembros('fam-1', CONFIG);
    const segunda = await svc.sincronizarMembros('fam-1', CONFIG);

    expect(segunda.novos).toBe(0);
    expect(membros.filter((m) => m.phone === '5564988887777')).toHaveLength(1);
  });

  it('casa telefone com e sem DDI, sem duplicar', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1', groupId: 'g@g.us' };
    // O dono está cadastrado como 5564999555364; o grupo devolve sem o 55.
    const p = comParticipantes([{ telefone: '64999555364', nome: 'Kirk' }]);

    const r = await servicoCom(p).sincronizarMembros('fam-1', CONFIG);
    expect(r.novos).toBe(0);
  });

  it('respeita o limite de 8 e reporta os excedentes', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1', groupId: 'g@g.us' };
    const lista = Array.from({ length: 12 }, (_, i) => ({
      telefone: `55649000000${String(i).padStart(2, '0')}`, nome: `Pessoa ${i}`,
    }));

    const r = await servicoCom(comParticipantes(lista)).sincronizarMembros('fam-1', CONFIG);

    // Já havia 1 membro (o dono), então entram 7 e sobram 5.
    expect(r).toMatchObject({ novos: 7, excedentes: 5, limite: 8, totalDeMembros: 8 });
    expect(membros).toHaveLength(8);
  });

  it('usa o telefone como id do membro, não o nome', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1', groupId: 'g@g.us' };
    const p = comParticipantes([{ telefone: '5564988887777', nome: 'Raquel 💜' }]);

    await servicoCom(p).sincronizarMembros('fam-1', CONFIG);
    expect(membros.find((m) => m.phone === '5564988887777').id).toBe('wa-5564988887777');
  });

  it('participante sem nome ainda entra, identificado pelo final do número', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1', groupId: 'g@g.us' };
    const p = comParticipantes([{ telefone: '5564988887777', nome: null }]);

    await servicoCom(p).sincronizarMembros('fam-1', CONFIG);
    expect(membros.find((m) => m.phone === '5564988887777').name).toBe('Membro 7777');
  });
});

describe('desconectar', () => {
  it('desliga sem apagar o cadastro', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1', groupId: 'g@g.us', enabled: true };
    const p = providerFalso();

    await servicoCom(p).desconectar('fam-1', CONFIG);

    expect(docs['fam-1'].enabled).toBe(false);
    expect(docs['fam-1'].groupId).toBe('g@g.us');
    expect(p.chamadas.some(([m]) => m === 'apagarInstancia')).toBe(false);
  });

  it('com --apagar, limpa instância e grupo', async () => {
    docs['fam-1'] = { instanceName: 'fam-fam-1', groupId: 'g@g.us', enabled: true };
    const p = providerFalso();

    await servicoCom(p).desconectar('fam-1', CONFIG, { apagar: true });

    expect(docs['fam-1'].groupId).toBeNull();
    expect(p.chamadas.some(([m]) => m === 'apagarInstancia')).toBe(true);
  });
});
