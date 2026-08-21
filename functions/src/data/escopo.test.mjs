import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Testes de isolamento entre famílias.
 *
 * O Firestore é dublado por um fake em memória. Não é para testar o Firestore
 * — é para provar que a camada de escopo NUNCA emite uma consulta sem o filtro
 * do tenant, e que buscar um documento de outra família devolve null.
 */

const estado = {
  documentos: {},      // 'colecao/id' -> dados
  filtrosAplicados: [], // registro de todo .where() emitido
};

/**
 * Sentinelas (arrayUnion, increment) são resolvidas pelo SERVIDOR do Firestore.
 * O dublê precisa resolver também: sem isso, o teste só consegue afirmar que a
 * escrita foi chamada, e não o EFEITO dela — que é justamente o que importa
 * quando a regra é "acrescentar mensagem sem reescrever o array".
 */
function resolverSentinelas(atual, patch) {
  const saida = { ...atual };

  for (const [campo, valor] of Object.entries(patch)) {
    if (valor && valor.__sentinela === 'arrayUnion') {
      const lista = Array.isArray(saida[campo]) ? saida[campo] : [];
      saida[campo] = [...lista, ...valor.itens];
    } else if (valor && valor.__sentinela === 'increment') {
      saida[campo] = (saida[campo] || 0) + valor.quanto;
    } else {
      saida[campo] = valor;
    }
  }

  return saida;
}

function fakeQuery(colecao, filtros = [], projecao = null) {
  return {
    where(campo, op, valor) {
      const novos = [...filtros, { campo, op, valor }];
      estado.filtrosAplicados.push({ colecao, campo, op, valor });
      return fakeQuery(colecao, novos, projecao);
    },
    orderBy() { return fakeQuery(colecao, filtros, projecao); },
    limit() { return fakeQuery(colecao, filtros, projecao); },
    // A fila de chamados e a varredura diária projetam campos para não baixar o
    // array de mensagens inteiro. Sem isto no dublê, esses testes nem montam.
    select(...campos) { return fakeQuery(colecao, filtros, campos); },
    async get() {
      const docs = Object.entries(estado.documentos)
        .filter(([chave]) => chave.startsWith(`${colecao}/`))
        .map(([chave, dados]) => ({ id: chave.split('/')[1], _dados: dados }))
        .filter((doc) => filtros.every((f) => {
          const v = doc._dados[f.campo];
          if (f.op === '==') return v === f.valor;
          if (f.op === 'in') return Array.isArray(f.valor) && f.valor.includes(v);
          return true;
        }))
        .map((doc) => ({
          id: doc.id,
          data: () => (projecao
            ? Object.fromEntries(projecao.filter((c) => c in doc._dados).map((c) => [c, doc._dados[c]]))
            : doc._dados),
        }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
    _filtros: filtros,
  };
}

let contadorDeId = 0;

function fakeRef(colecao, id) {
  const chave = `${colecao}/${id}`;
  return {
    id,
    _chave: chave,
    async get() {
      const dados = estado.documentos[chave];
      return { exists: !!dados, id, data: () => dados };
    },
    async update(dados) {
      estado.documentos[chave] = resolverSentinelas(estado.documentos[chave], dados);
    },
    async delete() { delete estado.documentos[chave]; },
    async create(dados) {
      if (estado.documentos[chave]) {
        throw Object.assign(new Error('already exists'), { code: 6 });
      }
      estado.documentos[chave] = resolverSentinelas({}, dados);
    },
  };
}

const fakeDb = {
  collection(nome) {
    const q = fakeQuery(nome);
    return {
      ...q,
      doc(id) { return fakeRef(nome, id || `gerado-${++contadorDeId}`); },
      async add(dados) {
        const id = `gerado-${++contadorDeId}`;
        estado.documentos[`${nome}/${id}`] = dados;
        return { id, async get() { return { id, data: () => estado.documentos[`${nome}/${id}`] }; } };
      },
    };
  },

  /**
   * Transação do dublê: aplica a escrita na hora, enquanto o Firestore de
   * verdade acumula e só grava no commit.
   *
   * A diferença importa para uma coisa só, e ela precisa estar escrita: este
   * dublê NÃO reproduz contenção. Dois "chamados simultâneos" aqui são
   * sequenciais, então nenhum teste daqui prova numeração atômica — essa prova
   * é ponta a ponta, contra homologação. O que ele prova é o contrato: quem é
   * lido, o que é escrito, e o que é recusado.
   */
  async runTransaction(fn) {
    const tx = {
      async get(ref) { return ref.get(); },
      create(ref, dados) {
        if (estado.documentos[ref._chave]) {
          throw Object.assign(new Error('already exists'), { code: 6 });
        }
        estado.documentos[ref._chave] = resolverSentinelas({}, dados);
      },
      set(ref, dados, opcoes) {
        estado.documentos[ref._chave] = opcoes?.merge
          ? resolverSentinelas(estado.documentos[ref._chave] || {}, dados)
          : resolverSentinelas({}, dados);
      },
      update(ref, dados) {
        if (!estado.documentos[ref._chave]) throw new Error('documento não existe');
        estado.documentos[ref._chave] = resolverSentinelas(estado.documentos[ref._chave], dados);
      },
    };
    return fn(tx);
  },
};

// Injecao direta: o modulo sob teste recebe este banco falso por parametro.
// Nada de vi.mock — mock que nao pega faz o teste escrever em producao.
import { criarEscopo, ErroDeEscopo } from './escopo.js';

const fakeAdmin = {
  firestore: {
    FieldValue: {
      serverTimestamp: () => '<agora>',
      arrayUnion: (...itens) => ({ __sentinela: 'arrayUnion', itens }),
      increment: (quanto) => ({ __sentinela: 'increment', quanto }),
    },
    Timestamp: { fromDate: (d) => d },
  },
};

const escopoDe = criarEscopo(fakeDb, fakeAdmin);

const FAMILIA_A = 'household-A';
const FAMILIA_B = 'household-B';

beforeEach(() => {
  estado.documentos = {
    'transactions/tx-da-A': { householdId: FAMILIA_A, description: 'mercado da A', amount: 100 },
    'transactions/tx-da-B': { householdId: FAMILIA_B, description: 'mercado da B', amount: 200 },
    'categories/cat-da-B': { householdId: FAMILIA_B, name: 'Categoria da B' },
    'categories/cat-padrao': { isDefault: true, name: 'Mercado' },
    'supportTickets/chamado-da-A': {
      householdId: FAMILIA_A,
      numero: 1,
      assunto: 'não consigo importar o extrato',
      status: 'ABERTO',
      quantidadeMensagens: 1,
      mensagens: [{ id: 'm1', autor: 'CLIENTE', texto: 'primeira' }],
    },
    'supportTickets/chamado-da-B': {
      householdId: FAMILIA_B,
      numero: 2,
      assunto: 'cobrança duplicada',
      status: 'ABERTO',
      quantidadeMensagens: 1,
      mensagens: [{ id: 'm1', autor: 'CLIENTE', texto: 'da família B' }],
    },
  };
  estado.filtrosAplicados = [];
});

describe('escopoDe — criação', () => {
  it('recusa householdId ausente, vazio ou inválido', () => {
    expect(() => escopoDe()).toThrow(ErroDeEscopo);
    expect(() => escopoDe(null)).toThrow(ErroDeEscopo);
    expect(() => escopoDe('')).toThrow(ErroDeEscopo);
    expect(() => escopoDe('   ')).toThrow(ErroDeEscopo);
    expect(() => escopoDe(123)).toThrow(ErroDeEscopo);
  });

  it('recusa coleção não declarada', () => {
    expect(() => escopoDe(FAMILIA_A).consultar('coisas')).toThrow(ErroDeEscopo);
  });
});

describe('isolamento entre famílias', () => {
  it('toda consulta sai com o filtro do tenant', async () => {
    await escopoDe(FAMILIA_A).consultar('transactions').get();

    const filtroDeTenant = estado.filtrosAplicados.find((f) => f.campo === 'householdId');
    expect(filtroDeTenant).toBeDefined();
    expect(filtroDeTenant.valor).toBe(FAMILIA_A);
  });

  it('mantém o filtro do tenant mesmo encadeando outros where', async () => {
    await escopoDe(FAMILIA_A).consultar('transactions')
      .where('type', '==', 'EXPENSE')
      .where('referenceMonth', '==', '2026-08')
      .get();

    const deTenant = estado.filtrosAplicados.filter((f) => f.campo === 'householdId');
    expect(deTenant).toHaveLength(1);
    expect(deTenant[0].valor).toBe(FAMILIA_A);
  });

  it('a consulta da família A não traz documento da família B', async () => {
    const snap = await escopoDe(FAMILIA_A).consultar('transactions').get();
    const descricoes = snap.docs.map((d) => d.data().description);

    expect(descricoes).toContain('mercado da A');
    expect(descricoes).not.toContain('mercado da B');
  });

  it('buscar por ID um documento de outra família devolve null', async () => {
    expect(await escopoDe(FAMILIA_A).buscarDoc('transactions', 'tx-da-B')).toBeNull();
  });

  it('não distingue "não existe" de "é de outra família"', async () => {
    const deOutra = await escopoDe(FAMILIA_A).buscarDoc('transactions', 'tx-da-B');
    const inexistente = await escopoDe(FAMILIA_A).buscarDoc('transactions', 'tx-que-nao-existe');
    expect(deOutra).toEqual(inexistente); // ambos null — não dá para sondar IDs
  });

  it('busca normalmente o documento da própria família', async () => {
    const tx = await escopoDe(FAMILIA_A).buscarDoc('transactions', 'tx-da-A');
    expect(tx).toMatchObject({ id: 'tx-da-A', description: 'mercado da A' });
  });
});

describe('escrita', () => {
  it('carimba o householdId ao criar', async () => {
    const criado = await escopoDe(FAMILIA_A).criar('transactions', { description: 'novo', amount: 10 });
    expect(criado.householdId).toBe(FAMILIA_A);
  });

  it('ignora householdId enviado de fora ao criar', async () => {
    const criado = await escopoDe(FAMILIA_A).criar('transactions', {
      description: 'tentativa', householdId: FAMILIA_B,
    });
    expect(criado.householdId).toBe(FAMILIA_A);
  });

  it('não deixa atualizar documento de outra família', async () => {
    await expect(
      escopoDe(FAMILIA_A).atualizar('transactions', 'tx-da-B', { amount: 999 })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(estado.documentos['transactions/tx-da-B'].amount).toBe(200);
  });

  it('não deixa apagar documento de outra família', async () => {
    await expect(
      escopoDe(FAMILIA_A).remover('transactions', 'tx-da-B')
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(estado.documentos['transactions/tx-da-B']).toBeDefined();
  });

  it('não deixa mover um registro para outra família via update', async () => {
    await escopoDe(FAMILIA_A).atualizar('transactions', 'tx-da-A', {
      householdId: FAMILIA_B, amount: 50,
    });

    expect(estado.documentos['transactions/tx-da-A'].householdId).toBe(FAMILIA_A);
    expect(estado.documentos['transactions/tx-da-A'].amount).toBe(50);
  });
});

describe('coleções mistas (categorias e formas de pagamento)', () => {
  it('lê o registro padrão global, marcado como somente leitura', async () => {
    const cat = await escopoDe(FAMILIA_A).buscarDoc('categories', 'cat-padrao');
    expect(cat).toMatchObject({ name: 'Mercado', _somenteLeitura: true });
  });

  it('não deixa alterar registro padrão global', async () => {
    await expect(
      escopoDe(FAMILIA_A).atualizar('categories', 'cat-padrao', { name: 'Sequestrada' })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(estado.documentos['categories/cat-padrao'].name).toBe('Mercado');
  });

  it('não enxerga categoria personalizada de outra família', async () => {
    expect(await escopoDe(FAMILIA_A).buscarDoc('categories', 'cat-da-B')).toBeNull();
  });
});

describe('criarEmTransacao — criação dentro de uma transação', () => {
  it('carimba o householdId', async () => {
    await fakeDb.runTransaction(async (tx) => {
      const ref = fakeDb.collection('supportTickets').doc('novo-1');
      escopoDe(FAMILIA_A).criarEmTransacao(tx, 'supportTickets', ref, { assunto: 'teste' });
    });

    expect(estado.documentos['supportTickets/novo-1'].householdId).toBe(FAMILIA_A);
  });

  it('ignora householdId enviado de fora', async () => {
    await fakeDb.runTransaction(async (tx) => {
      const ref = fakeDb.collection('supportTickets').doc('novo-2');
      escopoDe(FAMILIA_A).criarEmTransacao(tx, 'supportTickets', ref, {
        assunto: 'tentativa', householdId: FAMILIA_B,
      });
    });

    expect(estado.documentos['supportTickets/novo-2'].householdId).toBe(FAMILIA_A);
  });

  it('carimba createdAt e updatedAt', async () => {
    await fakeDb.runTransaction(async (tx) => {
      const ref = fakeDb.collection('supportTickets').doc('novo-3');
      escopoDe(FAMILIA_A).criarEmTransacao(tx, 'supportTickets', ref, { assunto: 'x' });
    });

    expect(estado.documentos['supportTickets/novo-3']).toMatchObject({
      createdAt: '<agora>', updatedAt: '<agora>',
    });
  });

  it('recusa coleção não declarada em escopo.js', async () => {
    await expect(
      fakeDb.runTransaction(async (tx) => {
        const ref = fakeDb.collection('supportTickets').doc('novo-4');
        escopoDe(FAMILIA_A).criarEmTransacao(tx, 'coisas', ref, {});
      })
    ).rejects.toThrow(ErroDeEscopo);
  });

  it('recusa gravar por cima de um id que já existe', async () => {
    await expect(
      fakeDb.runTransaction(async (tx) => {
        const ref = fakeDb.collection('supportTickets').doc('chamado-da-A');
        escopoDe(FAMILIA_A).criarEmTransacao(tx, 'supportTickets', ref, { assunto: 'sobrescrita' });
      })
    ).rejects.toMatchObject({ code: 6 });

    expect(estado.documentos['supportTickets/chamado-da-A'].assunto)
      .toBe('não consigo importar o extrato');
  });
});

describe('atualizarAtomico — escrita atômica com conferência de dono', () => {
  it('aplica o patch no documento da própria família', async () => {
    await escopoDe(FAMILIA_A).atualizarAtomico('supportTickets', 'chamado-da-A', () => ({
      status: 'EM_ANDAMENTO',
    }));

    expect(estado.documentos['supportTickets/chamado-da-A'].status).toBe('EM_ANDAMENTO');
  });

  it('recusa documento de outra família e NÃO escreve nada', async () => {
    await expect(
      escopoDe(FAMILIA_A).atualizarAtomico('supportTickets', 'chamado-da-B', () => ({ status: 'RESOLVIDO' }))
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(estado.documentos['supportTickets/chamado-da-B'].status).toBe('ABERTO');
  });

  it('não distingue "não existe" de "é de outra família"', async () => {
    const deOutra = await escopoDe(FAMILIA_A)
      .atualizarAtomico('supportTickets', 'chamado-da-B', () => ({ status: 'X' }))
      .catch((e) => ({ statusCode: e.statusCode, message: e.message }));

    const inexistente = await escopoDe(FAMILIA_A)
      .atualizarAtomico('supportTickets', 'nao-existe', () => ({ status: 'X' }))
      .catch((e) => ({ statusCode: e.statusCode, message: e.message }));

    expect(deOutra).toEqual(inexistente); // sondar id não revela nada
  });

  it('não deixa mover o registro para outra família pelo patch', async () => {
    await escopoDe(FAMILIA_A).atualizarAtomico('supportTickets', 'chamado-da-A', () => ({
      householdId: FAMILIA_B, status: 'EM_ANDAMENTO',
    }));

    expect(estado.documentos['supportTickets/chamado-da-A'].householdId).toBe(FAMILIA_A);
    expect(estado.documentos['supportTickets/chamado-da-A'].status).toBe('EM_ANDAMENTO');
  });

  it('acrescenta mensagem com arrayUnion, sem perder as anteriores', async () => {
    await escopoDe(FAMILIA_A).atualizarAtomico('supportTickets', 'chamado-da-A', () => ({
      mensagens: fakeAdmin.firestore.FieldValue.arrayUnion({ id: 'm2', autor: 'SUPORTE', texto: 'segunda' }),
      quantidadeMensagens: fakeAdmin.firestore.FieldValue.increment(1),
    }));

    const chamado = estado.documentos['supportTickets/chamado-da-A'];
    expect(chamado.mensagens).toHaveLength(2);
    expect(chamado.mensagens[0].texto).toBe('primeira');
    expect(chamado.mensagens[1].texto).toBe('segunda');
    expect(chamado.quantidadeMensagens).toBe(2);
  });

  it('entrega ao montarPatch o documento como ele está agora', async () => {
    let visto = null;

    await escopoDe(FAMILIA_A).atualizarAtomico('supportTickets', 'chamado-da-A', (atual) => {
      visto = atual;
      return { status: 'EM_ANDAMENTO' };
    });

    expect(visto).toMatchObject({ id: 'chamado-da-A', status: 'ABERTO', numero: 1 });
  });

  it('devolve o documento COMO ERA ANTES do patch', async () => {
    // Sentinela é resolvida no servidor, então montar um "depois" aqui seria
    // chute com cara de verdade. Quem precisa do estado novo relê.
    const antes = await escopoDe(FAMILIA_A).atualizarAtomico('supportTickets', 'chamado-da-A', () => ({
      status: 'RESOLVIDO',
    }));

    expect(antes.status).toBe('ABERTO');
    expect(estado.documentos['supportTickets/chamado-da-A'].status).toBe('RESOLVIDO');
  });

  it('não escreve nada quando montarPatch devolve null', async () => {
    await escopoDe(FAMILIA_A).atualizarAtomico('supportTickets', 'chamado-da-A', () => null);

    expect(estado.documentos['supportTickets/chamado-da-A'].status).toBe('ABERTO');
    expect(estado.documentos['supportTickets/chamado-da-A'].updatedAt).toBeUndefined();
  });

  it('carimba updatedAt junto do patch', async () => {
    await escopoDe(FAMILIA_A).atualizarAtomico('supportTickets', 'chamado-da-A', () => ({ status: 'RESOLVIDO' }));

    expect(estado.documentos['supportTickets/chamado-da-A'].updatedAt).toBe('<agora>');
  });

  it('recusa registro padrão global de coleção mista', async () => {
    await expect(
      escopoDe(FAMILIA_A).atualizarAtomico('categories', 'cat-padrao', () => ({ name: 'Sequestrada' }))
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(estado.documentos['categories/cat-padrao'].name).toBe('Mercado');
  });

  it('recusa coleção não declarada em escopo.js', async () => {
    await expect(
      escopoDe(FAMILIA_A).atualizarAtomico('coisas', 'qualquer', () => ({}))
    ).rejects.toThrow(ErroDeEscopo);
  });
});

describe('supportTickets é coleção escopada', () => {
  it('a consulta sai com o filtro do tenant', async () => {
    await escopoDe(FAMILIA_A).consultar('supportTickets').get();

    const deTenant = estado.filtrosAplicados.filter(
      (f) => f.colecao === 'supportTickets' && f.campo === 'householdId'
    );
    expect(deTenant).toHaveLength(1);
    expect(deTenant[0].valor).toBe(FAMILIA_A);
  });

  it('a família A não enxerga o chamado da família B', async () => {
    const snap = await escopoDe(FAMILIA_A).consultar('supportTickets').get();
    const assuntos = snap.docs.map((d) => d.data().assunto);

    expect(assuntos).toContain('não consigo importar o extrato');
    expect(assuntos).not.toContain('cobrança duplicada');
  });

  it('buscar por id um chamado de outra família devolve null', async () => {
    expect(await escopoDe(FAMILIA_A).buscarDoc('supportTickets', 'chamado-da-B')).toBeNull();
  });
});

describe('select — projeção sem baixar o array de mensagens', () => {
  it('mantém o filtro do tenant', async () => {
    await escopoDe(FAMILIA_A).consultar('supportTickets').select('status').get();

    const deTenant = estado.filtrosAplicados.filter(
      (f) => f.colecao === 'supportTickets' && f.campo === 'householdId'
    );
    expect(deTenant[0].valor).toBe(FAMILIA_A);
  });

  it('devolve só os campos pedidos', async () => {
    const snap = await escopoDe(FAMILIA_A).consultar('supportTickets').select('status', 'numero').get();
    const dados = snap.docs[0].data();

    expect(dados).toEqual({ status: 'ABERTO', numero: 1 });
    expect(dados.mensagens).toBeUndefined();
  });
});
