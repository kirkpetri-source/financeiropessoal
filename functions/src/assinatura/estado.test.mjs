import { describe, it, expect } from 'vitest';
import {
  situacaoDaAssinatura,
  assinaturaAtiva,
  mensagemDaSituacao,
  paraData,
  STATUS,
  MOTIVOS,
  DIAS_DE_CARENCIA,
} from './estado.js';

/**
 * Estes testes são a rede de segurança do bloqueio. Um falso positivo aqui
 * corta o acesso de quem pagou.
 */

const AGORA = new Date('2026-08-06T12:00:00Z');

function emDias(n) {
  return new Date(AGORA.getTime() + n * 24 * 60 * 60 * 1000);
}

// Dublê de Timestamp do Firestore — o campo real não é Date.
function timestamp(data) {
  return { toDate: () => data };
}

describe('paraData', () => {
  it('aceita Timestamp do Firestore, Date, string e número', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(paraData(timestamp(d))).toEqual(d);
    expect(paraData(d)).toEqual(d);
    expect(paraData('2026-01-01T00:00:00Z')).toEqual(d);
    expect(paraData(d.getTime())).toEqual(d);
  });

  it('devolve null no que não é data — nunca vira epoch', () => {
    expect(paraData(null)).toBeNull();
    expect(paraData(undefined)).toBeNull();
    expect(paraData('')).toBeNull();
    expect(paraData('não é data')).toBeNull();
  });
});

describe('trial', () => {
  it('trial vigente pode lançar e informa os dias restantes', () => {
    const s = situacaoDaAssinatura(
      { status: STATUS.TRIAL, trialEndsAt: timestamp(emDias(10)) },
      AGORA
    );
    expect(s.podeLancar).toBe(true);
    expect(s.emTrial).toBe(true);
    expect(s.motivo).toBe(MOTIVOS.TRIAL);
    expect(s.diasRestantes).toBe(10);
  });

  it('trial vencido bloqueia o lançamento', () => {
    const s = situacaoDaAssinatura(
      { status: STATUS.TRIAL, trialEndsAt: timestamp(emDias(-1)) },
      AGORA
    );
    expect(s.podeLancar).toBe(false);
    expect(s.motivo).toBe(MOTIVOS.TRIAL_VENCIDO);
  });

  it('trial sem data de fim não libera nada', () => {
    const s = situacaoDaAssinatura({ status: STATUS.TRIAL }, AGORA);
    expect(s.podeLancar).toBe(false);
    expect(s.motivo).toBe(MOTIVOS.TRIAL_VENCIDO);
  });

  it('trial que vence hoje mais tarde ainda vale', () => {
    const s = situacaoDaAssinatura(
      { status: STATUS.TRIAL, trialEndsAt: new Date('2026-08-06T23:59:00Z') },
      AGORA
    );
    expect(s.podeLancar).toBe(true);
  });
});

describe('assinatura ativa', () => {
  it('em dia dentro do período pago', () => {
    const s = situacaoDaAssinatura(
      { status: STATUS.ATIVA, currentPeriodEnd: timestamp(emDias(20)) },
      AGORA
    );
    expect(s.podeLancar).toBe(true);
    expect(s.motivo).toBe(MOTIVOS.EM_DIA);
    expect(s.precisaPagar).toBe(false);
    expect(s.emCarencia).toBe(false);
  });

  it('recém-autorizada, ainda sem período fechado, continua liberada', () => {
    const s = situacaoDaAssinatura({ status: STATUS.ATIVA }, AGORA);
    expect(s.podeLancar).toBe(true);
    expect(s.motivo).toBe(MOTIVOS.EM_DIA);
  });

  it('vencida há poucos dias entra em carência sem perder acesso', () => {
    const s = situacaoDaAssinatura(
      { status: STATUS.ATIVA, currentPeriodEnd: timestamp(emDias(-2)) },
      AGORA
    );
    expect(s.podeLancar).toBe(true);
    expect(s.emCarencia).toBe(true);
    expect(s.motivo).toBe(MOTIVOS.CARENCIA);
  });

  it('passada a carência, bloqueia', () => {
    const s = situacaoDaAssinatura(
      { status: STATUS.ATIVA, currentPeriodEnd: timestamp(emDias(-DIAS_DE_CARENCIA - 1)) },
      AGORA
    );
    expect(s.podeLancar).toBe(false);
    expect(s.motivo).toBe(MOTIVOS.PAGAMENTO_ATRASADO);
  });
});

describe('pagamento atrasado', () => {
  it('dentro da carência ainda lança', () => {
    const s = situacaoDaAssinatura(
      { status: STATUS.ATRASADA, currentPeriodEnd: timestamp(emDias(-1)) },
      AGORA
    );
    expect(s.podeLancar).toBe(true);
    expect(s.emCarencia).toBe(true);
  });

  it('fora da carência bloqueia', () => {
    const s = situacaoDaAssinatura(
      { status: STATUS.ATRASADA, currentPeriodEnd: timestamp(emDias(-30)) },
      AGORA
    );
    expect(s.podeLancar).toBe(false);
    expect(s.motivo).toBe(MOTIVOS.PAGAMENTO_ATRASADO);
  });

  it('atrasada sem período algum bloqueia — não inventa carência', () => {
    const s = situacaoDaAssinatura({ status: STATUS.ATRASADA }, AGORA);
    expect(s.podeLancar).toBe(false);
  });
});

describe('cancelamento', () => {
  it('quem cancelou usa até o fim do período já pago', () => {
    const s = situacaoDaAssinatura(
      { status: STATUS.CANCELADA, currentPeriodEnd: timestamp(emDias(12)) },
      AGORA
    );
    expect(s.podeLancar).toBe(true);
    expect(s.motivo).toBe(MOTIVOS.CANCELADA);
    expect(s.diasRestantes).toBe(12);
  });

  it('depois do período pago, bloqueia', () => {
    const s = situacaoDaAssinatura(
      { status: STATUS.CANCELADA, currentPeriodEnd: timestamp(emDias(-1)) },
      AGORA
    );
    expect(s.podeLancar).toBe(false);
  });
});

describe('o trial sobrevive ao status do provedor', () => {
  it('checkout iniciado no meio do trial não bloqueia ninguém', () => {
    const s = situacaoDaAssinatura(
      { status: STATUS.PENDENTE, trialEndsAt: timestamp(emDias(9)) },
      AGORA
    );
    expect(s.podeLancar).toBe(true);
    expect(s.emTrial).toBe(true);
  });

  it('pendente com trial vencido bloqueia', () => {
    const s = situacaoDaAssinatura(
      { status: STATUS.PENDENTE, trialEndsAt: timestamp(emDias(-1)) },
      AGORA
    );
    expect(s.podeLancar).toBe(false);
    expect(s.motivo).toBe(MOTIVOS.AGUARDANDO_PAGAMENTO);
  });

  it('pausada durante o trial não bloqueia', () => {
    const s = situacaoDaAssinatura(
      { status: STATUS.PAUSADA, trialEndsAt: timestamp(emDias(5)) },
      AGORA
    );
    expect(s.podeLancar).toBe(true);
  });
});

describe('ausência de assinatura', () => {
  it('household sem subscription não lança', () => {
    expect(situacaoDaAssinatura(null, AGORA).podeLancar).toBe(false);
    expect(situacaoDaAssinatura({}, AGORA).podeLancar).toBe(false);
    expect(situacaoDaAssinatura(undefined, AGORA).motivo).toBe(MOTIVOS.SEM_ASSINATURA);
  });

  it('status desconhecido bloqueia — falha fechada', () => {
    const s = situacaoDaAssinatura({ status: 'inventado' }, AGORA);
    expect(s.podeLancar).toBe(false);
  });
});

describe('assinaturaAtiva', () => {
  it('espelha podeLancar a partir do household inteiro', () => {
    expect(assinaturaAtiva({ subscription: { status: STATUS.ATIVA } }, AGORA)).toBe(true);
    expect(assinaturaAtiva({ subscription: { status: STATUS.TRIAL, trialEndsAt: emDias(-1) } }, AGORA)).toBe(false);
    expect(assinaturaAtiva(null, AGORA)).toBe(false);
    expect(assinaturaAtiva({}, AGORA)).toBe(false);
  });
});

describe('bloqueio manual do operador (adminOverride)', () => {
  it('bloqueia mesmo quem está com a assinatura ativa e em dia', () => {
    const s = situacaoDaAssinatura({
      status: STATUS.ATIVA,
      currentPeriodEnd: timestamp(emDias(20)),
      adminOverride: { blocked: true, reason: 'chargeback' },
    }, AGORA);

    expect(s.podeLancar).toBe(false);
    expect(s.motivo).toBe(MOTIVOS.BLOQUEADA_PELO_OPERADOR);
    expect(s.motivoBloqueio).toBe('chargeback');
  });

  it('bloqueia mesmo em trial vigente', () => {
    const s = situacaoDaAssinatura({
      status: STATUS.TRIAL,
      trialEndsAt: timestamp(emDias(10)),
      adminOverride: { blocked: true },
    }, AGORA);

    expect(s.podeLancar).toBe(false);
    expect(s.motivo).toBe(MOTIVOS.BLOQUEADA_PELO_OPERADOR);
  });

  it('adminOverride.blocked false não muda nada', () => {
    const s = situacaoDaAssinatura({
      status: STATUS.ATIVA,
      currentPeriodEnd: timestamp(emDias(20)),
      adminOverride: { blocked: false },
    }, AGORA);

    expect(s.podeLancar).toBe(true);
    expect(s.motivo).toBe(MOTIVOS.EM_DIA);
  });
});

describe('mensagemDaSituacao', () => {
  it('avisa com urgência quando o trial está no fim', () => {
    const s = situacaoDaAssinatura({ status: STATUS.TRIAL, trialEndsAt: emDias(2) }, AGORA);
    expect(mensagemDaSituacao(s)).toMatch(/termina em 2 dia/);
  });

  it('deixa claro que o dado continua lá quando bloqueia', () => {
    const s = situacaoDaAssinatura({ status: STATUS.TRIAL, trialEndsAt: emDias(-1) }, AGORA);
    expect(mensagemDaSituacao(s)).toMatch(/dados continuam/);
  });

  it('tem texto para todo motivo possível', () => {
    for (const motivo of Object.values(MOTIVOS)) {
      expect(mensagemDaSituacao({ motivo, diasRestantes: 5, podeLancar: false })).toBeTruthy();
    }
  });
});
