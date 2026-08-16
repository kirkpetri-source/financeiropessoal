import { describe, it, expect } from 'vitest';
import {
  mesCorrente,
  ultimoMesFechado,
  motivoDeRecusa,
  filtrarRetroativas,
  explicarRecusa,
  MOTIVO,
} from './janela.js';

/**
 * A janela é a barreira principal contra duplicidade: o mês corrente é onde os
 * lançamentos por WhatsApp estão acontecendo, e mantê-lo fora da importação
 * elimina a sobreposição na origem.
 *
 * O caso que mais importa aqui é a virada do mês no fuso do Brasil: o servidor
 * roda em UTC, então entre 21h e 00h (BRT) do último dia do mês o servidor já
 * está no mês seguinte. Sem o fuso fixo, a importação do mês que ainda está
 * correndo abriria três horas cedo.
 */

describe('mês corrente no fuso do Brasil', () => {
  it('usa o fuso de São Paulo, não o do servidor', () => {
    // 01/09/2026 00:30 UTC = 31/08/2026 21:30 em São Paulo: ainda é agosto.
    expect(mesCorrente(new Date('2026-09-01T00:30:00Z'))).toBe('2026-08');
  });

  it('vira o mês quando vira de verdade no Brasil', () => {
    // 01/09/2026 03:30 UTC = 01/09/2026 00:30 em São Paulo.
    expect(mesCorrente(new Date('2026-09-01T03:30:00Z'))).toBe('2026-09');
  });

  it('último mês fechado atravessa a virada de ano', () => {
    expect(ultimoMesFechado(new Date('2026-01-15T12:00:00Z'))).toBe('2025-12');
  });
});

describe('motivoDeRecusa', () => {
  const agora = new Date('2026-08-16T15:00:00Z'); // agosto/2026 correndo

  it('aceita mês fechado', () => {
    expect(motivoDeRecusa('2026-07-31', agora)).toBeNull();
    expect(motivoDeRecusa('2025-12-01', agora)).toBeNull();
  });

  it('recusa o mês em andamento, inclusive o dia 1º', () => {
    expect(motivoDeRecusa('2026-08-01', agora)).toBe(MOTIVO.MES_CORRENTE);
    expect(motivoDeRecusa('2026-08-16', agora)).toBe(MOTIVO.MES_CORRENTE);
  });

  it('recusa data futura', () => {
    expect(motivoDeRecusa('2026-09-02', agora)).toBe(MOTIVO.FUTURA);
  });

  it('libera agosto assim que setembro começa no Brasil', () => {
    const setembro = new Date('2026-09-01T03:30:00Z');
    expect(motivoDeRecusa('2026-08-16', setembro)).toBeNull();
  });
});

describe('filtrarRetroativas', () => {
  const agora = new Date('2026-08-16T15:00:00Z');

  it('separa o extrato misto que o banco realmente exporta', () => {
    // Caso normal: a pessoa baixa "1º de julho até hoje".
    const { aceitas, recusadas } = filtrarRetroativas([
      { data: '2026-07-05', valor: 10 },
      { data: '2026-07-28', valor: 20 },
      { data: '2026-08-02', valor: 30 },
      { data: '2026-08-15', valor: 40 },
    ], { agora });

    expect(aceitas.map((t) => t.data)).toEqual(['2026-07-05', '2026-07-28']);
    expect(recusadas).toHaveLength(2);
    expect(recusadas.every((t) => t.motivoRecusa === MOTIVO.MES_CORRENTE)).toBe(true);
  });

  it('extrato só do mês corrente não aceita nada', () => {
    const { aceitas, recusadas } = filtrarRetroativas([
      { data: '2026-08-01', valor: 10 },
      { data: '2026-08-10', valor: 20 },
    ], { agora });

    expect(aceitas).toHaveLength(0);
    expect(recusadas).toHaveLength(2);
  });

  it('lista vazia não quebra', () => {
    expect(filtrarRetroativas(undefined, { agora })).toEqual({ aceitas: [], recusadas: [] });
  });
});

describe('explicarRecusa', () => {
  it('diz até que mês dá para importar', () => {
    const texto = explicarRecusa(MOTIVO.MES_CORRENTE, new Date('2026-08-16T15:00:00Z'));
    expect(texto).toContain('2026-07');
  });
});
