import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarAssistente, ativa, INTERRUPTOR, LISTA } from './assistenteService.js';

const FAMILIA = 'fam-1';
const QUEM = 'user-abc';

let iaResposta;
let cotaResposta;
let usoResposta;
let trocasGravadas;

const ia = { responder: vi.fn(async () => iaResposta) };

let acaoPendenteResposta;

const sessoes = {
  registrarTroca: vi.fn(async (_d, quem, troca) => { trocasGravadas.push({ quem, ...troca }); }),
  historico: vi.fn(async () => [{ papel: 'usuario', texto: 'oi' }]),
  limpar: vi.fn(async () => {}),
  lerAcaoPendente: vi.fn(async () => acaoPendenteResposta),
};

const limite = {
  consumir: vi.fn(async () => cotaResposta),
  consultarUso: vi.fn(async () => usoResposta),
  mensagemDeLimite: () => 'Chegamos no limite de conversa de hoje.',
};

const escopoDe = vi.fn((id) => ({ householdId: id }));

const svc = () => criarAssistente({ ia, sessoes, limite, escopoDe });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env[INTERRUPTOR];
  delete process.env[LISTA];
  trocasGravadas = [];
  iaResposta = { texto: 'Você gastou R$ 520,00 em Mercado.', ferramentasUsadas: ['gastoPorCategoria'] };
  cotaResposta = { permitido: true, percentual: 15 };
  usoResposta = { percentual: 15, esgotado: false };
  acaoPendenteResposta = null;
});

describe('responder', () => {
  it('devolve o texto e as consultas usadas', async () => {
    const r = await svc().responder({ householdId: FAMILIA, pergunta: 'quanto gastei?', interlocutor: QUEM });

    expect(r.texto).toContain('520');
    expect(r.consultasUsadas).toEqual(['gastoPorCategoria']);
    expect(r.uso.percentual).toBe(15);
  });

  it('trava o escopo na família autenticada', async () => {
    await svc().responder({ householdId: FAMILIA, pergunta: 'x', interlocutor: QUEM });

    expect(escopoDe).toHaveBeenCalledWith(FAMILIA);
    expect(ia.responder.mock.calls[0][0].dados.householdId).toBe(FAMILIA);
  });

  it('grava a troca na memória da pessoa certa', async () => {
    await svc().responder({ householdId: FAMILIA, pergunta: 'quanto gastei?', interlocutor: QUEM });

    expect(trocasGravadas).toHaveLength(1);
    expect(trocasGravadas[0]).toMatchObject({ quem: QUEM, pergunta: 'quanto gastei?' });
  });

  it('repassa as permissões para o filtro de ferramentas', async () => {
    await svc().responder({
      householdId: FAMILIA, pergunta: 'x', interlocutor: QUEM, permissoes: { lancar: false },
    });

    expect(ia.responder.mock.calls[0][0].permissoes).toEqual({ lancar: false });
  });

  it('pergunta vazia não gasta cota nem chama o modelo', async () => {
    const r = await svc().responder({ householdId: FAMILIA, pergunta: '   ', interlocutor: QUEM });

    expect(r.codigo).toBe('PERGUNTA_VAZIA');
    expect(limite.consumir).not.toHaveBeenCalled();
    expect(ia.responder).not.toHaveBeenCalled();
  });
});

describe('cota', () => {
  // Consumir DEPOIS de chamar o modelo deixaria uma janela em que duas
  // perguntas simultâneas passam as duas — e IA já paga não volta atrás.
  it('consome a cota ANTES de falar com o modelo', async () => {
    const ordem = [];
    limite.consumir.mockImplementationOnce(async () => { ordem.push('cota'); return cotaResposta; });
    ia.responder.mockImplementationOnce(async () => { ordem.push('modelo'); return iaResposta; });

    await svc().responder({ householdId: FAMILIA, pergunta: 'x', interlocutor: QUEM });

    expect(ordem).toEqual(['cota', 'modelo']);
  });

  it('cota estourada não chama o modelo', async () => {
    cotaResposta = { permitido: false, percentual: 100 };

    const r = await svc().responder({ householdId: FAMILIA, pergunta: 'x', interlocutor: QUEM });

    expect(r.codigo).toBe('LIMITE_DIARIO');
    expect(ia.responder).not.toHaveBeenCalled();
  });

  it('a recusa por cota ensina o caminho que continua aberto', async () => {
    cotaResposta = { permitido: false, percentual: 100 };
    const r = await svc().responder({ householdId: FAMILIA, pergunta: 'x', interlocutor: QUEM });

    expect(r.erro).toContain('limite de conversa');
  });

  it('consultar o uso não consome nada', async () => {
    await svc().uso(FAMILIA);

    expect(limite.consultarUso).toHaveBeenCalled();
    expect(limite.consumir).not.toHaveBeenCalled();
  });
});

describe('liberação por família', () => {
  // É o que permite estrear a feature em produção com uma família de teste
  // enquanto as famílias pagantes seguem sem ver absolutamente nada.
  it('com lista configurada, só as famílias listadas têm a assistente', () => {
    process.env[LISTA] = 'fam-teste,fam-outra';

    expect(ativa('fam-teste')).toBe(true);
    expect(ativa('fam-outra')).toBe(true);
    expect(ativa('fam-de-cliente-real')).toBe(false);
  });

  it('sem lista, vale para todos', () => {
    delete process.env[LISTA];
    expect(ativa('qualquer-familia')).toBe(true);
  });

  it('tolera espaços na lista', () => {
    process.env[LISTA] = ' fam-a , fam-b ';
    expect(ativa('fam-a')).toBe(true);
    expect(ativa('fam-b')).toBe(true);
  });

  // Liberar por omissão seria o erro mais caro possível aqui.
  it('com lista, chamada sem família fica de FORA', () => {
    process.env[LISTA] = 'fam-teste';
    expect(ativa()).toBe(false);
    expect(ativa(undefined)).toBe(false);
    expect(ativa('')).toBe(false);
  });

  it('o desligamento geral vence a lista', () => {
    process.env[LISTA] = 'fam-teste';
    process.env[INTERRUPTOR] = 'false';
    expect(ativa('fam-teste')).toBe(false);
  });

  it('família fora da lista não gasta cota nem chama o modelo', async () => {
    process.env[LISTA] = 'outra-familia';

    const r = await svc().responder({ householdId: FAMILIA, pergunta: 'oi', interlocutor: QUEM });

    expect(r.codigo).toBe('DESLIGADA');
    expect(limite.consumir).not.toHaveBeenCalled();
    expect(ia.responder).not.toHaveBeenCalled();
  });

  it('família da lista conversa normalmente', async () => {
    process.env[LISTA] = FAMILIA;

    const r = await svc().responder({ householdId: FAMILIA, pergunta: 'oi', interlocutor: QUEM });
    expect(r.texto).toBeTruthy();
  });
});

describe('interruptor de desligamento', () => {
  it('ligada por padrão', () => {
    expect(ativa()).toBe(true);
  });

  it('desligada não chama o modelo nem gasta cota', async () => {
    process.env[INTERRUPTOR] = 'false';

    const r = await svc().responder({ householdId: FAMILIA, pergunta: 'x', interlocutor: QUEM });

    expect(r.codigo).toBe('DESLIGADA');
    expect(limite.consumir).not.toHaveBeenCalled();
    expect(ia.responder).not.toHaveBeenCalled();
  });

  it('desligada, o uso responde que está inativa', async () => {
    process.env[INTERRUPTOR] = 'false';
    expect(await svc().uso(FAMILIA)).toEqual({ ativa: false });
  });

  it('qualquer valor diferente de "false" mantém ligada', () => {
    process.env[INTERRUPTOR] = 'true';
    expect(ativa()).toBe(true);
    process.env[INTERRUPTOR] = 'sim';
    expect(ativa()).toBe(true);
  });
});

describe('quando o modelo falha', () => {
  it('a troca ainda entra na memória', async () => {
    // Sem isso a pergunta some da conversa e a pessoa não entende por que a
    // assistente "esqueceu" o assunto.
    iaResposta = { texto: 'Não consegui pensar direito agora.', ferramentasUsadas: [], erro: 'MODELO_INDISPONIVEL' };

    const r = await svc().responder({ householdId: FAMILIA, pergunta: 'quanto gastei?', interlocutor: QUEM });

    expect(trocasGravadas).toHaveLength(1);
    expect(r.avisoTecnico).toBe('MODELO_INDISPONIVEL');
    expect(r.texto).toBeTruthy();
  });
});

describe('histórico', () => {
  it('devolve as mensagens da pessoa', async () => {
    const r = await svc().historico({ householdId: FAMILIA, interlocutor: QUEM });
    expect(r.mensagens).toHaveLength(1);
  });

  it('desligada, devolve vazio sem consultar', async () => {
    process.env[INTERRUPTOR] = 'false';
    const r = await svc().historico({ householdId: FAMILIA, interlocutor: QUEM });

    expect(r).toEqual({ ativa: false, mensagens: [] });
    expect(sessoes.historico).not.toHaveBeenCalled();
  });

  it('limpar apaga só a conversa daquela pessoa', async () => {
    await svc().limparConversa({ householdId: FAMILIA, interlocutor: QUEM });

    expect(sessoes.limpar).toHaveBeenCalledWith({ householdId: FAMILIA }, QUEM);
  });
});


/**
 * O WhatsApp precisa saber se a pessoa está respondendo "sim" a uma proposta,
 * porque "sim" está na lista de conversa fiada do roteador e seria descartado.
 * Foi assim que uma alteração ficou pendente para sempre no teste ao vivo de
 * 19/08/2026: a Nina propôs, o Kirk disse "Sim" e depois "Confirmo", e nada
 * aconteceu — nem a alteração, nem uma resposta.
 */
describe('temAcaoPendente', () => {
  const daFamilia = (extra = {}) => ({ householdId: FAMILIA, interlocutor: QUEM, ...extra });

  it('diz que sim quando existe proposta dentro do prazo', async () => {
    acaoPendenteResposta = {
      tipo: 'ALTERAR',
      expiraEm: new Date(Date.now() + 5 * 60000).toISOString(),
    };

    expect(await svc().temAcaoPendente(daFamilia())).toBe(true);
  });

  it('diz que não quando não há proposta nenhuma', async () => {
    acaoPendenteResposta = null;

    expect(await svc().temAcaoPendente(daFamilia())).toBe(false);
  });

  it('trata proposta vencida como inexistente', async () => {
    // Responder "expirou" a um "ok" solto custaria uma chamada de IA. O prazo
    // é curto de propósito; passou, volta a ser conversa fiada.
    acaoPendenteResposta = {
      tipo: 'ALTERAR',
      expiraEm: new Date(Date.now() - 60000).toISOString(),
    };

    expect(await svc().temAcaoPendente(daFamilia())).toBe(false);
  });

  it('aceita proposta sem prazo declarado', async () => {
    acaoPendenteResposta = { tipo: 'APAGAR' };

    expect(await svc().temAcaoPendente(daFamilia())).toBe(true);
  });

  it('nem consulta o banco quando a assistente está desligada', async () => {
    process.env[INTERRUPTOR] = 'false';
    acaoPendenteResposta = { tipo: 'ALTERAR' };

    expect(await svc().temAcaoPendente(daFamilia())).toBe(false);
    expect(sessoes.lerAcaoPendente).not.toHaveBeenCalled();
  });

  it('nem consulta o banco quando a família está fora da lista de liberação', async () => {
    process.env[LISTA] = 'outra-familia';
    acaoPendenteResposta = { tipo: 'ALTERAR' };

    expect(await svc().temAcaoPendente(daFamilia())).toBe(false);
    expect(sessoes.lerAcaoPendente).not.toHaveBeenCalled();
  });

  it('sem interlocutor não procura proposta de ninguém', async () => {
    acaoPendenteResposta = { tipo: 'ALTERAR' };

    expect(await svc().temAcaoPendente({ householdId: FAMILIA, interlocutor: null })).toBe(false);
    expect(sessoes.lerAcaoPendente).not.toHaveBeenCalled();
  });
});
