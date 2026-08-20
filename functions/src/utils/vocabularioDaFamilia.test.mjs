import { describe, it, expect } from 'vitest';
import { identificarNoVocabulario, citaTermo } from './vocabularioDaFamilia.js';

/**
 * O bug que este módulo conserta, relatado por usuários em produção e
 * reproduzido contra o banco em 20/08/2026: lançar citando uma SUBCATEGORIA
 * ("gastei 45 na padaria") caía no palpite da IA e ia para Alimentação ou
 * Outros, porque o parser só conhecia categorias.
 */

const MERCADO = { id: 'cat-mercado', name: 'Mercado' };
const SAUDE = { id: 'cat-saude', name: 'Saúde' };
const CARTAO = { id: 'cat-cartao', name: 'Cartão de Crédito' };
const INTERNET = { id: 'cat-internet', name: 'Internet' };

const VOCAB = {
  categorias: [MERCADO, SAUDE, CARTAO, INTERNET],
  subcategorias: [
    { id: 'sub-padaria', name: 'Padaria', categoryId: 'cat-mercado' },
    { id: 'sub-acougue', name: 'Açougue', categoryId: 'cat-mercado' },
    { id: 'sub-academia', name: 'Academia', categoryId: 'cat-saude' },
    { id: 'sub-hortifruti', name: 'Hortifruti', categoryId: 'cat-mercado' },
  ],
};

const achar = (t) => identificarNoVocabulario(t, VOCAB);

describe('subcategoria citada pelo nome', () => {
  it('acha a subcategoria e traz a categoria-mãe junto', () => {
    const r = achar('gastei 45 na padaria');
    expect(r.subcategoria.name).toBe('Padaria');
    expect(r.categoria.name).toBe('Mercado');
  });

  it('funciona com acento', () => {
    expect(achar('paguei 120 no açougue').subcategoria.name).toBe('Açougue');
  });

  it('funciona sem acento — gente escreve dos dois jeitos', () => {
    expect(achar('paguei 120 no acougue').subcategoria.name).toBe('Açougue');
  });

  it('aceita plural simples', () => {
    expect(achar('gastei 30 nas padarias').subcategoria.name).toBe('Padaria');
  });

  it('subcategoria de outra categoria aponta para a mãe certa', () => {
    const r = achar('gastei 59,90 na academia');
    expect(r.subcategoria.name).toBe('Academia');
    expect(r.categoria.name).toBe('Saúde');
  });
});

describe('a subcategoria ganha da categoria', () => {
  it('quem escreve "padaria" foi mais específico que "mercado"', () => {
    const r = achar('gastei 45 na padaria do mercado');
    expect(r.subcategoria.name).toBe('Padaria');
    expect(r.categoria.name).toBe('Mercado');
  });

  it('só a categoria citada não inventa subcategoria', () => {
    const r = achar('gastei 80 no mercado');
    expect(r.categoria.name).toBe('Mercado');
    expect(r.subcategoria).toBeNull();
  });
});

describe('o que NÃO pode casar', () => {
  it('não casa dentro de outra palavra', () => {
    // Cicatriz do parser: "net" casava em "netflix", "posto" em "impostos".
    expect(achar('paguei 40 de netflix').categoria).toBeNull();
  });

  it('nada citado devolve vazio', () => {
    const r = achar('gastei 33 numa parada qualquer');
    expect(r.categoria).toBeNull();
    expect(r.subcategoria).toBeNull();
  });

  it('texto vazio não quebra', () => {
    expect(identificarNoVocabulario('', VOCAB).categoria).toBeNull();
    expect(identificarNoVocabulario(null, VOCAB).categoria).toBeNull();
  });

  it('vocabulário vazio não quebra', () => {
    expect(identificarNoVocabulario('gastei na padaria', {}).subcategoria).toBeNull();
    expect(identificarNoVocabulario('gastei na padaria').subcategoria).toBeNull();
  });

  it('subcategoria órfã é ignorada — sem mãe não há como lançar', () => {
    const r = identificarNoVocabulario('gastei 20 na padaria', {
      categorias: [SAUDE],
      subcategorias: [{ id: 's1', name: 'Padaria', categoryId: 'cat-que-foi-apagada' }],
    });
    expect(r.subcategoria).toBeNull();
  });
});

describe('nome mais longo vence', () => {
  it('"Cartão de Crédito" ganha de "Cartão"', () => {
    const r = identificarNoVocabulario('paguei 200 no cartão de crédito', {
      categorias: [CARTAO, { id: 'c2', name: 'Cartão' }],
      subcategorias: [],
    });
    expect(r.categoria.name).toBe('Cartão de Crédito');
  });
});

describe('citaTermo', () => {
  it('exige palavra inteira', () => {
    // "net" dentro de "netflix" não vale...
    expect(citaTermo('paguei de netflix', 'net')).toBe(false);
    // ...mas "net" sozinho vale, se a família tiver essa categoria.
    expect(citaTermo('paguei de net hoje', 'net')).toBe(true);
    expect(citaTermo('gastei na padaria', 'padaria')).toBe(true);
  });

  it('ignora termo curto demais para ser seguro', () => {
    expect(citaTermo('gastei em tv nova', 'tv')).toBe(false);
  });
});
