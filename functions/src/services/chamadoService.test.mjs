import { describe, it, expect, beforeEach } from 'vitest';
import { criarDuble } from '../__testes__/dubleDeBanco.mjs';
import { criarChamadoService } from './chamadoService.js';
import { STATUS, AUTORES, MOTIVOS_RESOLUCAO, LIMITES } from '../chamados/estado.js';

const FAMILIA_A = 'fam-A';
const FAMILIA_B = 'fam-B';
const AGORA = new Date('2026-08-21T12:00:00Z');
const diasAtras = (n) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000);

let duble;
let servico;
let dadosA;
let dadosB;

beforeEach(() => {
  duble = criarDuble();
  servico = criarChamadoService({ db: duble.db, admin: duble.admin });
  dadosA = duble.escopoDe(FAMILIA_A);
  dadosB = duble.escopoDe(FAMILIA_B);
});

const ABERTURA = {
  assunto: 'não consigo importar o extrato',
  categoria: 'PROBLEMA',
  texto: 'subo o OFX e não acontece nada',
  autorNome: 'Kirk',
  abertoPor: { uid: 'uid-kirk', nome: 'Kirk' },
};

function doc(numero) {
  return duble.estado.documentos[`supportTickets/${numero}`];
}

describe('abrirChamado — numeração', () => {
  it('o primeiro chamado do sistema é o número 1', async () => {
    const { numero } = await servico.abrirChamado(dadosA, ABERTURA, AGORA);

    expect(numero).toBe(1);
    expect(duble.estado.documentos['counters/supportTickets'].ultimo).toBe(1);
  });

  it('o número é global, não por família', async () => {
    await servico.abrirChamado(dadosA, ABERTURA, AGORA);
    const daOutra = await servico.abrirChamado(dadosB, ABERTURA, AGORA);

    expect(daOutra.numero).toBe(2);
  });

  it('o id do documento é o próprio número', async () => {
    const { numero, id } = await servico.abrirChamado(dadosA, ABERTURA, AGORA);

    expect(id).toBe(String(numero));
    expect(doc(numero)).toBeDefined();
  });

  it('o contador é lido ANTES de qualquer escrita da transação', async () => {
    // O dublê recusa leitura depois de escrita, como o Firestore faz. Se a
    // ordem estivesse invertida, isto estouraria em vez de passar.
    await expect(servico.abrirChamado(dadosA, ABERTURA, AGORA)).resolves.toBeDefined();
    expect(duble.estado.transacoes).toBe(1);
  });

  it('carimba o householdId da família que abriu', async () => {
    const { numero } = await servico.abrirChamado(dadosA, ABERTURA, AGORA);

    expect(doc(numero).householdId).toBe(FAMILIA_A);
  });
});

describe('abrirChamado — estado inicial', () => {
  it('nasce ABERTO, esperando o operador desde agora', async () => {
    const { numero } = await servico.abrirChamado(dadosA, ABERTURA, AGORA);
    const chamado = doc(numero);

    expect(chamado.status).toBe(STATUS.ABERTO);
    expect(chamado.aguardandoOperadorDesde.toDate()).toEqual(AGORA);
    expect(chamado.ultimaMensagemPor).toBe(AUTORES.CLIENTE);
  });

  it('acende o indicador do operador, não o do cliente', async () => {
    const { numero } = await servico.abrirChamado(dadosA, ABERTURA, AGORA);

    expect(doc(numero).naoLidoPeloOperador).toBe(true);
    expect(doc(numero).naoLidoPeloCliente).toBe(false);
  });

  it('já nasce com a primeira mensagem e a contagem certa', async () => {
    const { numero } = await servico.abrirChamado(dadosA, ABERTURA, AGORA);
    const chamado = doc(numero);

    expect(chamado.mensagens).toHaveLength(1);
    expect(chamado.mensagens[0]).toMatchObject({
      autor: AUTORES.CLIENTE, texto: 'subo o OFX e não acontece nada',
    });
    expect(chamado.quantidadeMensagens).toBe(1);
  });

  it('recusa assunto vazio', async () => {
    await expect(
      servico.abrirChamado(dadosA, { ...ABERTURA, assunto: '   ' }, AGORA)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('recusa mensagem vazia', async () => {
    await expect(
      servico.abrirChamado(dadosA, { ...ABERTURA, texto: '  ' }, AGORA)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('recusa mensagem acima do limite de caracteres', async () => {
    await expect(
      servico.abrirChamado(dadosA, {
        ...ABERTURA, texto: 'x'.repeat(LIMITES.CARACTERES_POR_MENSAGEM + 1),
      }, AGORA)
    ).rejects.toMatchObject({ statusCode: 400, codigo: 'MENSAGEM_LONGA' });
  });

  it('recusa mais anexos que o limite', async () => {
    const anexos = Array.from({ length: LIMITES.ANEXOS_POR_MENSAGEM + 1 }, (_, i) => ({ storagePath: `a${i}` }));

    await expect(
      servico.abrirChamado(dadosA, { ...ABERTURA, anexos }, AGORA)
    ).rejects.toMatchObject({ statusCode: 400, codigo: 'ANEXOS_DEMAIS' });
  });
});

describe('abrirChamado — teto de chamados abertos', () => {
  it(`recusa o chamado ${LIMITES.CHAMADOS_ABERTOS_POR_FAMILIA + 1} em aberto`, async () => {
    for (let i = 0; i < LIMITES.CHAMADOS_ABERTOS_POR_FAMILIA; i++) {
      await servico.abrirChamado(dadosA, ABERTURA, AGORA);
    }

    await expect(servico.abrirChamado(dadosA, ABERTURA, AGORA))
      .rejects.toMatchObject({ statusCode: 409, codigo: 'CHAMADOS_DEMAIS' });
  });

  it('chamado resolvido não conta para o teto', async () => {
    for (let i = 0; i < LIMITES.CHAMADOS_ABERTOS_POR_FAMILIA; i++) {
      await servico.abrirChamado(dadosA, ABERTURA, AGORA);
    }

    await servico.resolver(dadosA, 1, { motivo: MOTIVOS_RESOLUCAO.OPERADOR, porQuem: 'uid-op' }, AGORA);

    await expect(servico.abrirChamado(dadosA, ABERTURA, AGORA)).resolves.toBeDefined();
  });

  it('o teto é por família — a família B não é afetada pela A', async () => {
    for (let i = 0; i < LIMITES.CHAMADOS_ABERTOS_POR_FAMILIA; i++) {
      await servico.abrirChamado(dadosA, ABERTURA, AGORA);
    }

    await expect(servico.abrirChamado(dadosB, ABERTURA, AGORA)).resolves.toBeDefined();
  });
});

describe('responder', () => {
  beforeEach(async () => {
    await servico.abrirChamado(dadosA, ABERTURA, AGORA);
  });

  it('operador respondendo leva para AGUARDANDO_CLIENTE e zera a espera', async () => {
    await servico.responder(dadosA, 1, {
      autor: AUTORES.SUPORTE, autorNome: 'Suporte', texto: 'qual banco?',
    }, AGORA);

    expect(doc(1).status).toBe(STATUS.AGUARDANDO_CLIENTE);
    expect(doc(1).aguardandoOperadorDesde).toBeNull();
    expect(doc(1).naoLidoPeloCliente).toBe(true);
  });

  it('acrescenta a mensagem sem perder as anteriores', async () => {
    await servico.responder(dadosA, 1, { autor: AUTORES.SUPORTE, texto: 'qual banco?' }, AGORA);
    await servico.responder(dadosA, 1, { autor: AUTORES.CLIENTE, texto: 'Itaú' }, AGORA);

    const chamado = doc(1);
    expect(chamado.mensagens.map((m) => m.texto)).toEqual([
      'subo o OFX e não acontece nada', 'qual banco?', 'Itaú',
    ]);
    expect(chamado.quantidadeMensagens).toBe(3);
  });

  it('cliente respondendo devolve a bola ao suporte', async () => {
    await servico.responder(dadosA, 1, { autor: AUTORES.SUPORTE, texto: 'qual banco?' }, AGORA);

    const depois = new Date(AGORA.getTime() + 60_000);
    await servico.responder(dadosA, 1, { autor: AUTORES.CLIENTE, texto: 'Itaú' }, depois);

    expect(doc(1).status).toBe(STATUS.EM_ANDAMENTO);
    expect(doc(1).aguardandoOperadorDesde.toDate()).toEqual(depois);
    expect(doc(1).naoLidoPeloOperador).toBe(true);
    expect(doc(1).naoLidoPeloCliente).toBe(false);
  });

  it('cada mensagem tem id próprio', async () => {
    await servico.responder(dadosA, 1, { autor: AUTORES.SUPORTE, texto: 'a' }, AGORA);
    await servico.responder(dadosA, 1, { autor: AUTORES.SUPORTE, texto: 'b' }, AGORA);

    const ids = doc(1).mensagens.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('recusa chamado que não existe', async () => {
    await expect(
      servico.responder(dadosA, 999, { autor: AUTORES.CLIENTE, texto: 'oi' }, AGORA)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('responder — reabertura', () => {
  beforeEach(async () => {
    await servico.abrirChamado(dadosA, ABERTURA, AGORA);
  });

  it('dentro da janela reabre o MESMO chamado', async () => {
    await servico.resolver(dadosA, 1, {
      motivo: MOTIVOS_RESOLUCAO.OPERADOR, porQuem: 'uid-op',
    }, diasAtras(10));

    const r = await servico.responder(dadosA, 1, {
      autor: AUTORES.CLIENTE, texto: 'voltou a acontecer',
    }, AGORA);

    expect(r.chamadoNovo).toBe(false);
    expect(doc(1).status).toBe(STATUS.EM_ANDAMENTO);
    expect(doc(1).resolvidoEm).toBeNull();
    expect(doc(1).motivoResolucao).toBeNull();
    expect(doc(1).mensagens).toHaveLength(2);
  });

  it('fora da janela abre chamado NOVO apontando para o anterior', async () => {
    await servico.resolver(dadosA, 1, {
      motivo: MOTIVOS_RESOLUCAO.OPERADOR, porQuem: 'uid-op',
    }, diasAtras(90));

    const r = await servico.responder(dadosA, 1, {
      autor: AUTORES.CLIENTE, texto: 'voltou a acontecer', abertoPor: { uid: 'uid-kirk' },
    }, AGORA);

    expect(r.chamadoNovo).toBe(true);
    expect(r.numero).toBe(2);
    expect(doc(2).reaberturaDe).toBe(1);
    expect(doc(2).assunto).toBe(ABERTURA.assunto);

    // O antigo fica exatamente como estava: resolvido, com uma mensagem só.
    expect(doc(1).status).toBe(STATUS.RESOLVIDO);
    expect(doc(1).mensagens).toHaveLength(1);
  });
});

describe('resolver', () => {
  beforeEach(async () => {
    await servico.abrirChamado(dadosA, ABERTURA, AGORA);
  });

  it('registra quem resolveu e por quê', async () => {
    await servico.resolver(dadosA, 1, {
      motivo: MOTIVOS_RESOLUCAO.OPERADOR, porQuem: 'uid-do-kirk',
    }, AGORA);

    expect(doc(1)).toMatchObject({
      status: STATUS.RESOLVIDO,
      motivoResolucao: MOTIVOS_RESOLUCAO.OPERADOR,
      resolvidoPor: 'uid-do-kirk',
      aguardandoOperadorDesde: null,
    });
  });

  it('resolver de novo não reescreve nada', async () => {
    await servico.resolver(dadosA, 1, { motivo: MOTIVOS_RESOLUCAO.OPERADOR, porQuem: 'uid-1' }, AGORA);
    const primeiro = doc(1).resolvidoPor;

    await servico.resolver(dadosA, 1, { motivo: MOTIVOS_RESOLUCAO.OPERADOR, porQuem: 'uid-2' }, AGORA);

    expect(doc(1).resolvidoPor).toBe(primeiro);
  });
});

describe('marcarComoLido', () => {
  beforeEach(async () => {
    await servico.abrirChamado(dadosA, ABERTURA, AGORA);
  });

  it('apaga o indicador do lado pedido', async () => {
    await servico.marcarComoLido(dadosA, 1, AUTORES.SUPORTE);

    expect(doc(1).naoLidoPeloOperador).toBe(false);
  });

  it('não escreve quando já está lido', async () => {
    await servico.marcarComoLido(dadosA, 1, AUTORES.SUPORTE);
    const antes = doc(1).updatedAt;

    duble.estado.documentos['supportTickets/1'].updatedAt = 'marca-para-detectar-escrita';
    await servico.marcarComoLido(dadosA, 1, AUTORES.SUPORTE);

    expect(doc(1).updatedAt).toBe('marca-para-detectar-escrita');
    expect(antes).toBe('<agora>');
  });
});

describe('listar e buscar', () => {
  it('a lista não traz o array de mensagens', async () => {
    await servico.abrirChamado(dadosA, ABERTURA, AGORA);

    const lista = await servico.listarChamados(dadosA);

    expect(lista).toHaveLength(1);
    expect(lista[0].assunto).toBe(ABERTURA.assunto);
    expect(lista[0].mensagens).toBeUndefined();
  });

  it('a lista vem da mais recente para a mais antiga', async () => {
    await servico.abrirChamado(dadosA, ABERTURA, diasAtras(3));
    await servico.abrirChamado(dadosA, { ...ABERTURA, assunto: 'mais nova' }, AGORA);

    const lista = await servico.listarChamados(dadosA);

    expect(lista.map((c) => c.numero)).toEqual([2, 1]);
  });

  it('datas saem em ISO, prontas para o res.json', async () => {
    await servico.abrirChamado(dadosA, ABERTURA, AGORA);

    const chamado = await servico.buscarChamado(dadosA, 1);

    expect(chamado.criadoEm).toBe(AGORA.toISOString());
    expect(chamado.mensagens[0].em).toBe(AGORA.toISOString());
  });
});

describe('isolamento entre famílias — o que mais importa', () => {
  beforeEach(async () => {
    await servico.abrirChamado(dadosA, ABERTURA, AGORA);
  });

  it('a família B não lê o chamado da A', async () => {
    expect(await servico.buscarChamado(dadosB, 1)).toBeNull();
  });

  it('a família B não aparece com o chamado da A na lista', async () => {
    expect(await servico.listarChamados(dadosB)).toEqual([]);
  });

  it('a família B não responde ao chamado da A', async () => {
    await expect(
      servico.responder(dadosB, 1, { autor: AUTORES.CLIENTE, texto: 'invadindo' }, AGORA)
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(doc(1).mensagens).toHaveLength(1);
  });

  it('a família B não resolve o chamado da A', async () => {
    await expect(
      servico.resolver(dadosB, 1, { motivo: MOTIVOS_RESOLUCAO.OPERADOR, porQuem: 'uid' }, AGORA)
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(doc(1).status).toBe(STATUS.ABERTO);
  });

  it('a família B não apaga o indicador de não lido do chamado da A', async () => {
    await expect(
      servico.marcarComoLido(dadosB, 1, AUTORES.SUPORTE)
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(doc(1).naoLidoPeloOperador).toBe(true);
  });

  it('"não existe" e "é de outra família" são indistinguíveis', async () => {
    const daOutra = await servico.buscarChamado(dadosB, 1);
    const inexistente = await servico.buscarChamado(dadosB, 999);

    expect(daOutra).toEqual(inexistente);
  });
});
