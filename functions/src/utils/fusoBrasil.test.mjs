import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { FUSO, hojeNoBrasil, proximaMeiaNoiteBrasil } = require('./fusoBrasil.js');

describe('fusoBrasil', () => {
  it('usa America/Sao_Paulo, não o fuso do servidor', () => {
    expect(FUSO).toBe('America/Sao_Paulo');
  });

  describe('hojeNoBrasil', () => {
    it('devolve AAAA-MM-DD', () => {
      expect(hojeNoBrasil(new Date('2026-08-18T15:00:00Z'))).toBe('2026-08-18');
    });

    // O caso que motiva este módulo existir: o Cloud Run roda em UTC, então
    // entre 21h e meia-noite de Brasília o servidor já virou o dia. Um contador
    // "diário" baseado na data do servidor zerava às 21h para o usuário.
    it('às 22h de Brasília ainda é o mesmo dia, apesar de já ser o dia seguinte em UTC', () => {
      // 2026-08-18 22:00 BRT === 2026-08-19 01:00 UTC
      const instante = new Date('2026-08-19T01:00:00Z');
      expect(instante.toISOString().slice(0, 10)).toBe('2026-08-19'); // o que o servidor veria
      expect(hojeNoBrasil(instante)).toBe('2026-08-18');              // o que o usuário vive
    });

    it('vira o dia à meia-noite de Brasília, não antes', () => {
      // 23:59 BRT do dia 18 === 02:59 UTC do dia 19
      expect(hojeNoBrasil(new Date('2026-08-19T02:59:00Z'))).toBe('2026-08-18');
      // 00:01 BRT do dia 19 === 03:01 UTC do dia 19
      expect(hojeNoBrasil(new Date('2026-08-19T03:01:00Z'))).toBe('2026-08-19');
    });
  });

  describe('proximaMeiaNoiteBrasil', () => {
    it('devolve a data do dia seguinte em DD/MM', () => {
      expect(proximaMeiaNoiteBrasil(new Date('2026-08-18T15:00:00Z')).data).toBe('19/08');
    });

    it('atravessa a virada de mês', () => {
      expect(proximaMeiaNoiteBrasil(new Date('2026-08-31T15:00:00Z')).data).toBe('01/09');
    });

    it('atravessa a virada de ano', () => {
      const r = proximaMeiaNoiteBrasil(new Date('2026-12-31T15:00:00Z'));
      expect(r.data).toBe('01/01');
      expect(r.iso).toBe('2027-01-01');
    });

    // Às 22h BRT o servidor em UTC já acha que é o dia seguinte. Somar um dia
    // sobre a data do servidor daria dois dias à frente para o usuário.
    it('às 22h de Brasília, o "amanhã" é o dia seguinte para o usuário, não dois', () => {
      const r = proximaMeiaNoiteBrasil(new Date('2026-08-19T01:00:00Z'));
      expect(r.data).toBe('19/08');
      expect(r.iso).toBe('2026-08-19');
    });

    it('informa o horário para a mensagem ao cliente', () => {
      expect(proximaMeiaNoiteBrasil(new Date('2026-08-18T15:00:00Z')).hora).toBe('meia-noite');
    });
  });
});
