import { describe, it, expect } from 'vitest';
import { validarCelular, normalizarCelular, formatarCelular, semDDI } from './telefoneBR.js';

/**
 * O caso que originou este arquivo: um membro entrou com `6499715453` — dez
 * dígitos, faltando o 9 do celular. O cadastro aceitou e os gastos dele
 * ficaram sem atribuição, erro que só apareceria no relatório do mês.
 */

describe('celular válido', () => {
  it('aceita com e sem DDI, com e sem máscara', () => {
    for (const entrada of [
      '64999555364',
      '5564999555364',
      '(64) 99955-5364',
      '+55 64 99955-5364',
      '64 9 9955 5364',
    ]) {
      const r = validarCelular(entrada);
      expect(r.valido, `${entrada} deveria valer`).toBe(true);
      expect(r.e164).toBe('5564999555364');
    }
  });

  it('normaliza para o formato do WhatsApp', () => {
    expect(normalizarCelular('(64) 99955-5364')).toBe('5564999555364');
    expect(normalizarCelular('11987654321')).toBe('5511987654321');
  });
});

describe('celular inválido', () => {
  it('recusa o número que causou o problema — dez dígitos, sem o 9', () => {
    const r = validarCelular('6499715453');
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/Faltam dígitos/);
    expect(r.e164).toBeNull();
  });

  it('recusa fixo, que não recebe WhatsApp', () => {
    // DDD 64 + 3 (fixo) + 8 dígitos = 11, passa no tamanho mas não é celular.
    const r = validarCelular('6433211234' + '5');
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/começa com 9/);
  });

  it('recusa DDD que não existe', () => {
    expect(validarCelular('10999998888').erro).toMatch(/DDD 10 não existe/);
    expect(validarCelular('00999998888').erro).toMatch(/não existe/);
    expect(validarCelular('20999998888').erro).toMatch(/não existe/);
  });

  it('recusa vazio, curto e longo', () => {
    expect(validarCelular('').erro).toMatch(/Informe/);
    expect(validarCelular('999').valido).toBe(false);
    expect(validarCelular('649995553641234').valido).toBe(false);
  });

  it('recusa texto', () => {
    expect(validarCelular('meu whatsapp').valido).toBe(false);
    expect(normalizarCelular(null)).toBeNull();
  });
});

describe('apresentação', () => {
  it('formata para leitura', () => {
    expect(formatarCelular('5564999555364')).toBe('(64) 99955-5364');
    expect(formatarCelular('64999555364')).toBe('(64) 99955-5364');
  });

  it('devolve como veio o que não dá para formatar', () => {
    expect(formatarCelular('123')).toBe('123');
  });

  it('tira o DDI só quando ele existe', () => {
    expect(semDDI('5564999555364')).toBe('64999555364');
    expect(semDDI('64999555364')).toBe('64999555364');
    // 55 como DDD (Rio Grande do Sul) não pode ser confundido com DDI.
    expect(semDDI('55999998888')).toBe('55999998888');
  });
});
