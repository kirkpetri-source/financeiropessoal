import { describe, it, expect } from 'vitest';
import { resumirFamilias } from './metricas.js';
import { STATUS } from './estado.js';

const AGORA = new Date('2026-08-06T12:00:00Z');

function emDias(n) {
  return new Date(AGORA.getTime() + n * 24 * 60 * 60 * 1000);
}

function pagante(extra = {}) {
  return {
    subscription: { status: STATUS.ATIVA, priceCents: 2490, currentPeriodEnd: emDias(15), ...extra },
  };
}

describe('MRR', () => {
  it('soma só quem paga', () => {
    const r = resumirFamilias([
      pagante(),
      pagante(),
      { subscription: { status: STATUS.TRIAL, trialEndsAt: emDias(5) } },
      { subscription: { status: STATUS.CANCELADA } },
    ], AGORA);

    expect(r.pagantes).toBe(2);
    expect(r.mrrCentavos).toBe(4980);
    expect(r.mrr).toBe(49.8);
    expect(r.arr).toBe(597.6);
  });

  it('usa o preço contratado de cada família, não o preço de tabela', () => {
    const r = resumirFamilias([pagante({ priceCents: 1990 }), pagante()], AGORA);
    expect(r.mrrCentavos).toBe(1990 + 2490);
    expect(r.ticketMedioCentavos).toBe(2240);
  });

  it('assinatura antiga sem priceCents cai no preço de tabela', () => {
    const r = resumirFamilias([{ subscription: { status: STATUS.ATIVA } }], AGORA);
    expect(r.mrrCentavos).toBe(2490);
  });

  it('sem ninguém pagando, MRR é zero e não NaN', () => {
    const r = resumirFamilias([], AGORA);
    expect(r.mrr).toBe(0);
    expect(r.ticketMedioCentavos).toBe(0);
    expect(Number.isNaN(r.churnMensal)).toBe(false);
  });
});

describe('contagem por situação', () => {
  it('separa trial vigente de trial vencido', () => {
    const r = resumirFamilias([
      { subscription: { status: STATUS.TRIAL, trialEndsAt: emDias(3) } },
      { subscription: { status: STATUS.TRIAL, trialEndsAt: emDias(-3) } },
    ], AGORA);

    expect(r.emTrial).toBe(1);
    expect(r.trialVencido).toBe(1);
    expect(r.ativas).toBe(1);
  });

  it('conta como ativa quem está em carência', () => {
    const r = resumirFamilias([pagante({ currentPeriodEnd: emDias(-2) })], AGORA);
    expect(r.ativas).toBe(1);
    expect(r.emCarencia).toBe(1);
  });

  it('conta famílias com exclusão agendada', () => {
    const r = resumirFamilias([
      { ...pagante(), deletion: { scheduledFor: emDias(4) } },
      pagante(),
    ], AGORA);
    expect(r.aguardandoExclusao).toBe(1);
  });

  it('atrasadas e pendentes aparecem separadas', () => {
    const r = resumirFamilias([
      { subscription: { status: STATUS.ATRASADA, currentPeriodEnd: emDias(-1) } },
      { subscription: { status: STATUS.PENDENTE } },
    ], AGORA);

    expect(r.atrasadas).toBe(1);
    expect(r.pendentes).toBe(1);
    expect(r.total).toBe(2);
  });
});

describe('janela de 30 dias', () => {
  it('conta cadastros, ativações e cancelamentos recentes', () => {
    const r = resumirFamilias([
      { createdAt: emDias(-5), subscription: { status: STATUS.ATIVA, activatedAt: emDias(-4) } },
      { createdAt: emDias(-200), subscription: { status: STATUS.ATIVA, activatedAt: emDias(-190) } },
      { createdAt: emDias(-10), subscription: { status: STATUS.CANCELADA, canceledAt: emDias(-2) } },
    ], AGORA);

    expect(r.novasNaJanela).toBe(2);
    expect(r.ativadasNaJanela).toBe(1);
    expect(r.canceladasNaJanela).toBe(1);
  });

  it('ignora evento fora da janela e data no futuro', () => {
    const r = resumirFamilias([
      { createdAt: emDias(-45), subscription: { status: STATUS.CANCELADA, canceledAt: emDias(-40) } },
      { createdAt: emDias(3), subscription: { status: STATUS.ATIVA } },
    ], AGORA);

    expect(r.novasNaJanela).toBe(0);
    expect(r.canceladasNaJanela).toBe(0);
  });

  it('respeita a janela pedida', () => {
    const familias = [{ createdAt: emDias(-45), subscription: { status: STATUS.ATIVA } }];
    expect(resumirFamilias(familias, AGORA, 30).novasNaJanela).toBe(0);
    expect(resumirFamilias(familias, AGORA, 90).novasNaJanela).toBe(1);
  });
});

describe('churn e conversão', () => {
  it('churn é cancelamento sobre a base que pagava', () => {
    const r = resumirFamilias([
      pagante(), pagante(), pagante(),
      { subscription: { status: STATUS.CANCELADA, canceledAt: emDias(-3) } },
    ], AGORA);

    expect(r.churnMensal).toBeCloseTo(0.25, 4);
  });

  it('churn zero quando ninguém cancelou', () => {
    expect(resumirFamilias([pagante(), pagante()], AGORA).churnMensal).toBe(0);
  });

  it('conversão mede quem virou pagante entre os que saíram do trial', () => {
    const r = resumirFamilias([
      pagante(),
      { subscription: { status: STATUS.TRIAL, trialEndsAt: emDias(-1) } },
      { subscription: { status: STATUS.TRIAL, trialEndsAt: emDias(4) } },
    ], AGORA);

    // 1 pagante, 1 trial vencido, 0 cancelada -> 1/2. O trial em curso não conta.
    expect(r.conversaoDeTrial).toBeCloseTo(0.5, 4);
  });
});

describe('robustez dos dados', () => {
  it('família sem subscription não quebra o cálculo', () => {
    const r = resumirFamilias([{}, { subscription: null }, pagante()], AGORA);
    expect(r.total).toBe(3);
    expect(r.pagantes).toBe(1);
    expect(r.ativas).toBe(1);
  });

  it('aceita Timestamp do Firestore nas datas', () => {
    const r = resumirFamilias([
      { createdAt: { toDate: () => emDias(-2) }, subscription: { status: STATUS.ATIVA } },
    ], AGORA);
    expect(r.novasNaJanela).toBe(1);
  });

  it('status desconhecido não entra em nenhuma contagem de receita', () => {
    const r = resumirFamilias([{ subscription: { status: 'inventado', priceCents: 999999 } }], AGORA);
    expect(r.mrrCentavos).toBe(0);
    expect(r.ativas).toBe(0);
  });
});
