import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarAssistente, ativa, INTERRUPTOR } from './assistenteService.js';

const FAMILIA = 'fam-1';
const QUEM = 'user-abc';

let iaResposta;
let cotaResposta;
let usoResposta;
let trocasGravadas;

const ia = { responder: vi.fn(async () => iaResposta) };

const sessoes = {
  registrarTroca: vi.fn(async (_d, quem, troca) => { trocasGravadas.push({ quem, ...troca }); }),
  historico: vi.fn(async () => [{ papel: 'usuario', texto: 'oi' }]),
  limpar: vi.fn(async () => {}),
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
  trocasGravadas = [];
  iaResposta = { texto: 'Você gastou R$ 520,00 em Mercado.', ferramentasUsadas: ['gastoPorCategoria'] };
  cotaResposta = { permitido: true, percentual: 15 };
  usoResposta = { percentual: 15, esgotado: false };
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
