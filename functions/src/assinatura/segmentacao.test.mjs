import { describe, it, expect } from 'vitest';
import { filtrarPorSegmento, contarSegmentos, SEGMENTOS } from './segmentacao.js';
import { STATUS } from './estado.js';
import { PLANO_INTERNO } from './metricas.js';

const AGORA = new Date('2026-08-13T12:00:00Z');

function emDias(n) {
  return new Date(AGORA.getTime() + n * 24 * 60 * 60 * 1000);
}

const familias = [
  { id: 'trial-vigente', subscription: { status: STATUS.TRIAL, trialEndsAt: emDias(3) } },
  { id: 'trial-vencido', subscription: { status: STATUS.TRIAL, trialEndsAt: emDias(-1) } },
  { id: 'pagante-em-dia', subscription: { status: STATUS.ATIVA, currentPeriodEnd: emDias(10), priceCents: 2490 } },
  { id: 'pagante-carencia', subscription: { status: STATUS.ATIVA, currentPeriodEnd: emDias(-2), priceCents: 2490 } },
  { id: 'atrasada', subscription: { status: STATUS.ATRASADA, currentPeriodEnd: emDias(-10) } },
  { id: 'cortesia', subscription: { status: STATUS.ATIVA, plan: PLANO_INTERNO, priceCents: 0 } },
  { id: 'cancelada', subscription: { status: STATUS.CANCELADA } },
];

describe('filtrarPorSegmento', () => {
  it('"todas" devolve tudo, mesmo sem assinatura', () => {
    expect(filtrarPorSegmento([...familias, { id: 'sem-assinatura' }], 'todas', AGORA)).toHaveLength(familias.length + 1);
  });

  it('separa trial vigente de trial vencido', () => {
    expect(filtrarPorSegmento(familias, 'trial', AGORA).map((f) => f.id)).toEqual(['trial-vigente']);
    expect(filtrarPorSegmento(familias, 'trial_vencido', AGORA).map((f) => f.id)).toEqual(['trial-vencido']);
  });

  it('pagantes inclui quem está em carência (ainda paga, só atrasou a confirmação)', () => {
    const ids = filtrarPorSegmento(familias, 'pagantes', AGORA).map((f) => f.id).sort();
    expect(ids).toEqual(['pagante-carencia', 'pagante-em-dia']);
  });

  it('cortesia nunca entra em pagantes', () => {
    expect(filtrarPorSegmento(familias, 'pagantes', AGORA).map((f) => f.id)).not.toContain('cortesia');
  });

  it('carencia pega só quem está no período de graça', () => {
    expect(filtrarPorSegmento(familias, 'carencia', AGORA).map((f) => f.id)).toEqual(['pagante-carencia']);
  });

  it('atrasadas e canceladas são segmentos próprios', () => {
    expect(filtrarPorSegmento(familias, 'atrasadas', AGORA).map((f) => f.id)).toEqual(['atrasada']);
    expect(filtrarPorSegmento(familias, 'canceladas', AGORA).map((f) => f.id)).toEqual(['cancelada']);
  });

  it('cortesias pega só plano interno', () => {
    expect(filtrarPorSegmento(familias, 'cortesias', AGORA).map((f) => f.id)).toEqual(['cortesia']);
  });

  it('precisam_contato junta atraso + carência + trial vencido, sem repetir', () => {
    const ids = filtrarPorSegmento(familias, 'precisam_contato', AGORA).map((f) => f.id).sort();
    expect(ids).toEqual(['atrasada', 'pagante-carencia', 'trial-vencido']);
  });

  it('segmento inexistente lança erro 400', () => {
    expect(() => filtrarPorSegmento(familias, 'nao-existe', AGORA)).toThrow(/não existe/);
  });
});

describe('contarSegmentos', () => {
  it('cobre todos os segmentos declarados e soma bate com o total de famílias em "todas"', () => {
    const contagem = contarSegmentos(familias, AGORA);
    expect(contagem).toHaveLength(SEGMENTOS.length);
    expect(contagem.find((s) => s.chave === 'todas').total).toBe(familias.length);
  });
});
