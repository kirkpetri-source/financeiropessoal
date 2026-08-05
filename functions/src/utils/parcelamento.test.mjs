import { describe, it, expect } from 'vitest';
import parcelamento from './parcelamento.js';

const { detectarParcelamento, dividirEmParcelas, montarParcelas, somarMeses } = parcelamento;

describe('detectarParcelamento', () => {
  const aceitos = [
    ['geladeira 1200 em 10x', 10, 'geladeira 1200'],
    ['geladeira 1200 10x', 10, 'geladeira 1200'],
    ['sofa 900 em 3 vezes', 3, 'sofa 900'],
    ['tv 2000 em 12 parcelas', 12, 'tv 2000'],
    ['celular 3000 parcelado em 6', 6, 'celular 3000'],
    ['notebook 4500 6 parcelas', 6, 'notebook 4500'],
  ];

  for (const [texto, parcelas, limpo] of aceitos) {
    it(`entende "${texto}"`, () => {
      const r = detectarParcelamento(texto);
      expect(r).not.toBeNull();
      expect(r.parcelas).toBe(parcelas);
      expect(r.textoLimpo).toBe(limpo);
    });
  }

  it('ignora texto sem parcelamento', () => {
    expect(detectarParcelamento('mercado 84,90 pix')).toBeNull();
    expect(detectarParcelamento('gasolina 150')).toBeNull();
    expect(detectarParcelamento('')).toBeNull();
    expect(detectarParcelamento(null)).toBeNull();
  });

  it('recusa 1x e números fora da faixa', () => {
    expect(detectarParcelamento('tv 1000 em 1x')).toBeNull();
    expect(detectarParcelamento('tv 1000 em 99x')).toBeNull();
    expect(detectarParcelamento('tv 1000 em 0x')).toBeNull();
  });
});

describe('dividirEmParcelas', () => {
  it('não perde nem inventa centavos', () => {
    for (const [total, n] of [[100, 3], [1200, 10], [0.1, 3], [999.99, 7], [1, 3]]) {
      const parcelas = dividirEmParcelas(total, n);
      const soma = parcelas.reduce((s, v) => s + Math.round(v * 100), 0);
      expect(soma, `${total} em ${n}x`).toBe(Math.round(total * 100));
    }
  });

  it('joga a sobra na primeira parcela, como a operadora de cartão faz', () => {
    expect(dividirEmParcelas(100, 3)).toEqual([33.34, 33.33, 33.33]);
  });

  it('divide exato quando não há sobra', () => {
    expect(dividirEmParcelas(1200, 10)).toEqual(Array(10).fill(120));
  });

  it('gera a quantidade pedida de parcelas', () => {
    expect(dividirEmParcelas(500, 5)).toHaveLength(5);
    expect(dividirEmParcelas(500, 12)).toHaveLength(12);
  });
});

describe('somarMeses', () => {
  it('mantém o mesmo dia nos meses seguintes', () => {
    const r = somarMeses(new Date('2026-01-15T12:00:00'), 2);
    expect(r.getMonth()).toBe(2);   // março
    expect(r.getDate()).toBe(15);
  });

  it('não pula de mês quando o dia não existe no destino', () => {
    // 31/01 + 1 mês tem que virar 28/02, não 03/03
    const r = somarMeses(new Date('2026-01-31T12:00:00'), 1);
    expect(r.getMonth()).toBe(1);   // fevereiro
    expect(r.getDate()).toBeLessThanOrEqual(29);
  });

  it('vira o ano corretamente', () => {
    const r = somarMeses(new Date('2026-11-10T12:00:00'), 3);
    expect(r.getFullYear()).toBe(2027);
    expect(r.getMonth()).toBe(1);   // fevereiro
  });
});

describe('montarParcelas', () => {
  const base = {
    descricao: 'geladeira',
    valorTotal: 1200,
    parcelas: 10,
    dataDaCompra: '2026-01-15T12:00:00',
  };

  it('gera um lançamento por parcela', () => {
    expect(montarParcelas(base)).toHaveLength(10);
  });

  it('numera a parcela na descrição', () => {
    const r = montarParcelas(base);
    expect(r[0].description).toBe('geladeira (1/10)');
    expect(r[9].description).toBe('geladeira (10/10)');
  });

  it('a soma das parcelas bate com o valor da compra', () => {
    const r = montarParcelas({ ...base, valorTotal: 999.99, parcelas: 7 });
    const soma = r.reduce((s, p) => s + Math.round(p.amount * 100), 0);
    expect(soma).toBe(99999);
  });

  it('espalha as parcelas em meses consecutivos', () => {
    const r = montarParcelas(base);
    const meses = r.map((p) => new Date(p.date).getMonth());
    expect(meses[0]).toBe(0);   // janeiro
    expect(meses[1]).toBe(1);   // fevereiro
    expect(meses[9]).toBe(9);   // outubro
  });

  it('liga todas as parcelas pelo mesmo grupo', () => {
    const r = montarParcelas(base);
    const grupos = new Set(r.map((p) => p.grupoParcelamento));
    expect(grupos.size).toBe(1);
  });

  it('guarda o valor total em cada parcela, para a tela poder mostrar', () => {
    expect(montarParcelas(base).every((p) => p.valorTotal === 1200)).toBe(true);
  });
});
