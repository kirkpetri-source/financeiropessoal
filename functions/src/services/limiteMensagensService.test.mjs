import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarLimiteMensagensService } from './limiteMensagensService.js';

describe('permitirMensagem', () => {
  beforeEach(() => {
    delete process.env.LIMITE_MENSAGENS_POR_MINUTO;
    vi.useRealTimers();
  });

  it('permite mensagens até o limite configurado, dentro da mesma janela', () => {
    process.env.LIMITE_MENSAGENS_POR_MINUTO = '3';
    const { permitirMensagem } = criarLimiteMensagensService();

    expect(permitirMensagem('fam-1')).toBe(true);
    expect(permitirMensagem('fam-1')).toBe(true);
    expect(permitirMensagem('fam-1')).toBe(true);
    expect(permitirMensagem('fam-1')).toBe(false);
  });

  it('não mistura contagem entre famílias diferentes', () => {
    process.env.LIMITE_MENSAGENS_POR_MINUTO = '1';
    const { permitirMensagem } = criarLimiteMensagensService();

    expect(permitirMensagem('fam-1')).toBe(true);
    expect(permitirMensagem('fam-1')).toBe(false);
    expect(permitirMensagem('fam-2')).toBe(true);
  });

  it('libera de novo depois que a janela de um minuto vira', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T10:00:00Z'));
    process.env.LIMITE_MENSAGENS_POR_MINUTO = '1';
    const { permitirMensagem } = criarLimiteMensagensService();

    expect(permitirMensagem('fam-1')).toBe(true);
    expect(permitirMensagem('fam-1')).toBe(false);

    vi.setSystemTime(new Date('2026-08-09T10:01:01Z'));
    expect(permitirMensagem('fam-1')).toBe(true);

    vi.useRealTimers();
  });

  it('usa o limite padrão quando LIMITE_MENSAGENS_POR_MINUTO não está definido', () => {
    const { limite } = criarLimiteMensagensService();
    expect(limite).toBe(40);
  });
});
