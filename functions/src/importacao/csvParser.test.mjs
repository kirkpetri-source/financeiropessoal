import { describe, it, expect } from 'vitest';
import { lerCsv, ehCsv, lerValor, dividirLinha, detectarSeparador } from './csvParser.js';

/**
 * Os exemplos reproduzem os layouts que aparecem na prática. O ponto destes
 * testes não é "o parser lê CSV" — é que ele lê layouts DIFERENTES sem que
 * ninguém tenha cadastrado o banco antes, que é a promessa da funcionalidade.
 */

// Nubank pessoa física: ISO na data, valor com sinal, vírgula como separador.
const NUBANK = `Data,Valor,Identificador,Descrição
2026-08-05,-84.90,6273e2a1-1,Compra no débito - Supermercado Bom Preco
2026-08-06,-45.50,6273e2a1-2,Transferência enviada pelo Pix - Joao
2026-08-10,3200.00,6273e2a1-3,Transferência recebida pelo Pix - EMPRESA LTDA`;

// Itaú/BB: ponto e vírgula, data BR, valor com vírgula decimal.
const ITAU = `data;lançamento;valor
05/08/2026;SUPERMERCADO BOM PRECO;-84,90
06/08/2026;POSTO SHELL COMBUSTIVEL;-150,00
10/08/2026;SALARIO EMPRESA;3.200,00`;

// Banco que separa entrada e saída em colunas diferentes, sem sinal.
const COLUNAS_SEPARADAS = `Data;Histórico;Débito;Crédito
05/08/2026;COMPRA SUPERMERCADO;84,90;
10/08/2026;DEPOSITO SALARIO;;3200,00`;

describe('reconhecimento de CSV', () => {
  it('reconhece arquivo com separador e mais de uma linha', () => {
    expect(ehCsv(NUBANK)).toBe(true);
    expect(ehCsv(ITAU)).toBe(true);
  });

  it('recusa conteúdo que não é tabela', () => {
    expect(ehCsv('só uma linha solta')).toBe(false);
    expect(ehCsv('')).toBe(false);
  });
});

describe('separador e aspas', () => {
  it('detecta vírgula, ponto e vírgula e tabulação', () => {
    expect(detectarSeparador(NUBANK.split('\n'))).toBe(',');
    expect(detectarSeparador(ITAU.split('\n'))).toBe(';');
    expect(detectarSeparador(['a\tb\tc', '1\t2\t3'])).toBe('\t');
  });

  it('não quebra a linha na vírgula que está DENTRO da descrição', () => {
    const celulas = dividirLinha('05/08/2026,"PAG*MERCADO, LTDA",-84.90', ',');
    expect(celulas).toEqual(['05/08/2026', 'PAG*MERCADO, LTDA', '-84.90']);
  });

  it('entende aspas duplas escapadas', () => {
    expect(dividirLinha('a,"diz ""oi""",b', ',')).toEqual(['a', 'diz "oi"', 'b']);
  });
});

describe('leitura de valor', () => {
  it('lê formato brasileiro', () => {
    expect(lerValor('84,90')).toBe(84.9);
    expect(lerValor('1.234,56')).toBe(1234.56);
    expect(lerValor('-84,90')).toBe(-84.9);
    expect(lerValor('R$ 1.500,00')).toBe(1500);
  });

  it('lê formato americano', () => {
    expect(lerValor('84.90')).toBe(84.9);
    expect(lerValor('-3200.00')).toBe(-3200);
  });

  it('trata 1.234 como mil duzentos e trinta e quatro, não como 1,234', () => {
    expect(lerValor('1.234')).toBe(1234);
  });

  it('entende parênteses como negativo', () => {
    expect(lerValor('(84,90)')).toBe(-84.9);
  });

  it('devolve null no que não é valor', () => {
    expect(lerValor('')).toBeNull();
    expect(lerValor('abc')).toBeNull();
    expect(lerValor(null)).toBeNull();
  });
});

describe('layout do Nubank (data ISO, valor com sinal)', () => {
  const { transacoes, ignoradas } = lerCsv(NUBANK);

  it('lê todas as linhas', () => {
    expect(transacoes).toHaveLength(3);
    expect(ignoradas).toBe(0);
  });

  it('separa gasto de entrada pelo sinal do valor', () => {
    expect(transacoes[0]).toMatchObject({ data: '2026-08-05', tipo: 'EXPENSE', valor: 84.9 });
    expect(transacoes[2]).toMatchObject({ data: '2026-08-10', tipo: 'INCOME', valor: 3200 });
  });

  it('pega a descrição, e não o identificador, como texto do lançamento', () => {
    expect(transacoes[0].descricao).toContain('Supermercado Bom Preco');
    expect(transacoes[0].idDoBanco).toBe('6273e2a1-1');
  });
});

describe('layout do Itaú (ponto e vírgula, data BR, vírgula decimal)', () => {
  const { transacoes } = lerCsv(ITAU);

  it('lê sem ninguém ter cadastrado esse layout antes', () => {
    expect(transacoes).toHaveLength(3);
  });

  it('lê data no formato brasileiro sem trocar dia por mês', () => {
    expect(transacoes[0].data).toBe('2026-08-05');
    expect(transacoes[2].data).toBe('2026-08-10');
  });

  it('lê valor com milhar e vírgula decimal', () => {
    expect(transacoes[2]).toMatchObject({ tipo: 'INCOME', valor: 3200 });
  });
});

describe('layout com colunas de débito e crédito separadas', () => {
  const { transacoes } = lerCsv(COLUNAS_SEPARADAS);

  it('usa a coluna preenchida e tira o tipo dela, não do sinal', () => {
    expect(transacoes).toHaveLength(2);
    expect(transacoes[0]).toMatchObject({ tipo: 'EXPENSE', valor: 84.9 });
    expect(transacoes[1]).toMatchObject({ tipo: 'INCOME', valor: 3200 });
  });
});

describe('robustez', () => {
  it('lê arquivo SEM cabeçalho sem perder a primeira transação', () => {
    const semCabecalho = `05/08/2026;MERCADO;-84,90
06/08/2026;POSTO;-150,00`;
    const { transacoes } = lerCsv(semCabecalho);
    expect(transacoes).toHaveLength(2);
    expect(transacoes[0].descricao).toBe('MERCADO');
  });

  it('pula linha de saldo/total sem valor de transação', () => {
    const comSaldo = `Data;Histórico;Valor
05/08/2026;MERCADO;-84,90
;SALDO DO DIA;
06/08/2026;POSTO;-150,00`;
    const { transacoes, ignoradas } = lerCsv(comSaldo);
    expect(transacoes).toHaveLength(2);
    expect(ignoradas).toBe(1);
  });

  it('avisa com mensagem clara quando não acha coluna de data', () => {
    const semData = `produto;preco\nnotebook;3500\nmouse;80`;
    expect(() => lerCsv(semData)).toThrow(/coluna de data/i);
  });

  it('recusa arquivo vazio', () => {
    expect(() => lerCsv('')).toThrow(/vazio/i);
  });

  it('mantém acento e caracteres especiais da descrição', () => {
    const comAcento = `Data;Descrição;Valor\n05/08/2026;Farmácia São João;-45,90`;
    expect(lerCsv(comAcento).transacoes[0].descricao).toBe('Farmácia São João');
  });
});
