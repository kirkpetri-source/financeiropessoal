import { describe, it, expect } from 'vitest';
import {
  STATUS, AUTORES, MOTIVOS_RESOLUCAO, RESOLVIDO_PELO_SISTEMA,
  DIAS_PARA_REABRIR, DIAS_ATE_RESOLVER_POR_INATIVIDADE,
  estaAberto, podeReabrir, decidirTransicao, camposDeResolucao, venceuPorInatividade,
} from './estado.js';

/**
 * Regra de negócio pura: nenhum banco, nenhuma requisição. É aqui que se prova
 * "de quem é a vez" — a pergunta que a fila do operador responde sem julgamento
 * humano.
 */

const AGORA = new Date('2026-08-21T12:00:00Z');
const diasAtras = (n) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000);

describe('estaAberto', () => {
  it('conta ABERTO, EM_ANDAMENTO e AGUARDANDO_CLIENTE', () => {
    expect(estaAberto(STATUS.ABERTO)).toBe(true);
    expect(estaAberto(STATUS.EM_ANDAMENTO)).toBe(true);
    expect(estaAberto(STATUS.AGUARDANDO_CLIENTE)).toBe(true);
  });

  it('não conta RESOLVIDO', () => {
    expect(estaAberto(STATUS.RESOLVIDO)).toBe(false);
  });
});

describe('decidirTransicao — cliente responde', () => {
  it('leva para EM_ANDAMENTO e começa a contar a espera pelo suporte', () => {
    const { acao, campos } = decidirTransicao(
      { status: STATUS.AGUARDANDO_CLIENTE }, AUTORES.CLIENTE, AGORA
    );

    expect(acao).toBe('RESPONDER');
    expect(campos.status).toBe(STATUS.EM_ANDAMENTO);
    expect(campos.aguardandoOperadorDesde).toBe(AGORA);
  });

  it('acende o indicador do operador, nunca o do próprio cliente', () => {
    const { campos } = decidirTransicao({ status: STATUS.ABERTO }, AUTORES.CLIENTE, AGORA);

    expect(campos.naoLidoPeloOperador).toBe(true);
    expect(campos.naoLidoPeloCliente).toBe(false);
  });

  it('reabre chamado resolvido dentro da janela, limpando os campos de resolução', () => {
    const { acao, campos } = decidirTransicao({
      status: STATUS.RESOLVIDO,
      resolvidoEm: diasAtras(DIAS_PARA_REABRIR - 1),
      resolvidoPor: 'uid-operador',
      motivoResolucao: MOTIVOS_RESOLUCAO.OPERADOR,
    }, AUTORES.CLIENTE, AGORA);

    expect(acao).toBe('RESPONDER');
    expect(campos.status).toBe(STATUS.EM_ANDAMENTO);
    expect(campos.resolvidoEm).toBeNull();
    expect(campos.resolvidoPor).toBeNull();
    expect(campos.motivoResolucao).toBeNull();
    expect(campos.aguardandoOperadorDesde).toBe(AGORA);
  });

  it('fora da janela manda abrir chamado NOVO, apontando para o anterior', () => {
    const { acao, numeroAnterior } = decidirTransicao({
      status: STATUS.RESOLVIDO,
      numero: 42,
      resolvidoEm: diasAtras(DIAS_PARA_REABRIR + 1),
    }, AUTORES.CLIENTE, AGORA);

    expect(acao).toBe('CHAMADO_NOVO');
    expect(numeroAnterior).toBe(42);
  });

  it('reabre também quando o chamado foi encerrado por inatividade', () => {
    const { acao } = decidirTransicao({
      status: STATUS.RESOLVIDO,
      resolvidoEm: diasAtras(1),
      motivoResolucao: MOTIVOS_RESOLUCAO.INATIVIDADE_CLIENTE,
      resolvidoPor: RESOLVIDO_PELO_SISTEMA,
    }, AUTORES.CLIENTE, AGORA);

    expect(acao).toBe('RESPONDER');
  });
});

describe('decidirTransicao — operador responde', () => {
  it('leva para AGUARDANDO_CLIENTE e zera a espera', () => {
    const { campos } = decidirTransicao({ status: STATUS.ABERTO }, AUTORES.SUPORTE, AGORA);

    expect(campos.status).toBe(STATUS.AGUARDANDO_CLIENTE);
    expect(campos.aguardandoOperadorDesde).toBeNull();
  });

  it('acende o indicador do cliente, nunca o do próprio operador', () => {
    const { campos } = decidirTransicao({ status: STATUS.EM_ANDAMENTO }, AUTORES.SUPORTE, AGORA);

    expect(campos.naoLidoPeloCliente).toBe(true);
    expect(campos.naoLidoPeloOperador).toBe(false);
  });

  it('não é limitado pela janela de reabertura — ela é do cliente', () => {
    const { acao, campos } = decidirTransicao({
      status: STATUS.RESOLVIDO,
      resolvidoEm: diasAtras(DIAS_PARA_REABRIR + 30),
    }, AUTORES.SUPORTE, AGORA);

    expect(acao).toBe('RESPONDER');
    expect(campos.status).toBe(STATUS.AGUARDANDO_CLIENTE);
    expect(campos.motivoResolucao).toBeNull();
  });
});

describe('decidirTransicao — statusAlteradoEm', () => {
  it('só é carimbado quando o status muda de verdade', () => {
    const mudou = decidirTransicao({ status: STATUS.ABERTO }, AUTORES.CLIENTE, AGORA);
    expect(mudou.campos.statusAlteradoEm).toBe(AGORA);

    // Cliente respondendo duas vezes seguidas: já estava EM_ANDAMENTO.
    // Recarimbar aqui adiaria o encerramento por inatividade de graça.
    const naoMudou = decidirTransicao({ status: STATUS.EM_ANDAMENTO }, AUTORES.CLIENTE, AGORA);
    expect(naoMudou.campos.statusAlteradoEm).toBeUndefined();
  });
});

describe('decidirTransicao — entrada inválida', () => {
  it('recusa autor que não é CLIENTE nem SUPORTE', () => {
    expect(() => decidirTransicao({ status: STATUS.ABERTO }, 'ROBO', AGORA))
      .toThrow(/Autor inválido/);
  });
});

describe('podeReabrir', () => {
  it('aceita exatamente no último dia da janela', () => {
    expect(podeReabrir({
      status: STATUS.RESOLVIDO, resolvidoEm: diasAtras(DIAS_PARA_REABRIR),
    }, AGORA)).toBe(true);
  });

  it('recusa um dia depois', () => {
    expect(podeReabrir({
      status: STATUS.RESOLVIDO, resolvidoEm: diasAtras(DIAS_PARA_REABRIR + 1),
    }, AGORA)).toBe(false);
  });

  it('chamado que não está resolvido sempre aceita resposta', () => {
    expect(podeReabrir({ status: STATUS.AGUARDANDO_CLIENTE }, AGORA)).toBe(true);
  });

  it('resolvido SEM data de resolução aceita — dado incompleto é falha nossa', () => {
    expect(podeReabrir({ status: STATUS.RESOLVIDO, resolvidoEm: null }, AGORA)).toBe(true);
  });

  it('entende Timestamp do Firestore, Date e ISO', () => {
    const dataLimite = diasAtras(DIAS_PARA_REABRIR + 5);

    const comoTimestamp = { toMillis: () => dataLimite.getTime() };
    const comoIso = dataLimite.toISOString();

    expect(podeReabrir({ status: STATUS.RESOLVIDO, resolvidoEm: comoTimestamp }, AGORA)).toBe(false);
    expect(podeReabrir({ status: STATUS.RESOLVIDO, resolvidoEm: dataLimite }, AGORA)).toBe(false);
    expect(podeReabrir({ status: STATUS.RESOLVIDO, resolvidoEm: comoIso }, AGORA)).toBe(false);
  });
});

describe('camposDeResolucao', () => {
  it('registra quem resolveu e por quê, e tira o chamado da fila', () => {
    const campos = camposDeResolucao(
      { motivo: MOTIVOS_RESOLUCAO.OPERADOR, porQuem: 'uid-do-kirk' }, AGORA
    );

    expect(campos.status).toBe(STATUS.RESOLVIDO);
    expect(campos.motivoResolucao).toBe(MOTIVOS_RESOLUCAO.OPERADOR);
    expect(campos.resolvidoPor).toBe('uid-do-kirk');
    expect(campos.aguardandoOperadorDesde).toBeNull();
    expect(campos.statusAlteradoEm).toBe(AGORA);
  });

  it('resolução por operador avisa o cliente; por inatividade, não', () => {
    const porOperador = camposDeResolucao(
      { motivo: MOTIVOS_RESOLUCAO.OPERADOR, porQuem: 'uid' }, AGORA
    );
    const porSilencio = camposDeResolucao(
      { motivo: MOTIVOS_RESOLUCAO.INATIVIDADE_CLIENTE, porQuem: RESOLVIDO_PELO_SISTEMA }, AGORA
    );

    // Encerrar por silêncio é consequência de o cliente não ter respondido:
    // acender "não lido" por isso seria cobrar dele a própria ausência.
    expect(porOperador.naoLidoPeloCliente).toBe(true);
    expect(porSilencio.naoLidoPeloCliente).toBe(false);
  });

  it('recusa motivo inventado', () => {
    expect(() => camposDeResolucao({ motivo: 'CANSEI', porQuem: 'uid' }, AGORA))
      .toThrow(/Motivo de resolução inválido/);
  });
});

describe('venceuPorInatividade', () => {
  it('vence no dia 15 parado em AGUARDANDO_CLIENTE', () => {
    expect(venceuPorInatividade({
      status: STATUS.AGUARDANDO_CLIENTE,
      statusAlteradoEm: diasAtras(DIAS_ATE_RESOLVER_POR_INATIVIDADE),
    }, AGORA)).toBe(true);
  });

  it('não vence no dia 14', () => {
    expect(venceuPorInatividade({
      status: STATUS.AGUARDANDO_CLIENTE,
      statusAlteradoEm: diasAtras(DIAS_ATE_RESOLVER_POR_INATIVIDADE - 1),
    }, AGORA)).toBe(false);
  });

  it('nunca vence em outro status, por mais antigo que seja', () => {
    for (const status of [STATUS.ABERTO, STATUS.EM_ANDAMENTO, STATUS.RESOLVIDO]) {
      expect(venceuPorInatividade({ status, statusAlteradoEm: diasAtras(400) }, AGORA)).toBe(false);
    }
  });

  it('conta a partir de statusAlteradoEm, não de ultimaMensagemEm', () => {
    // O operador respondeu há 20 dias (statusAlteradoEm) e nada aconteceu
    // desde então. ultimaMensagemEm é a mesma coisa aqui, mas o campo que vale
    // é o do status — é ele que diz há quanto tempo a bola está com o cliente.
    expect(venceuPorInatividade({
      status: STATUS.AGUARDANDO_CLIENTE,
      statusAlteradoEm: diasAtras(20),
      ultimaMensagemEm: diasAtras(1),
    }, AGORA)).toBe(true);
  });

  it('cai para ultimaMensagemEm quando statusAlteradoEm não existe', () => {
    // Chamado gravado antes deste campo existir não pode ficar imortal na fila.
    expect(venceuPorInatividade({
      status: STATUS.AGUARDANDO_CLIENTE,
      ultimaMensagemEm: diasAtras(30),
    }, AGORA)).toBe(true);
  });

  it('sem data nenhuma, não vence — não inventa encerramento', () => {
    expect(venceuPorInatividade({ status: STATUS.AGUARDANDO_CLIENTE }, AGORA)).toBe(false);
  });
});
