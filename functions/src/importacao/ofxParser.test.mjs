import { describe, it, expect } from 'vitest';
import { lerOfx, ehOfx, dataDoOfx, valorDoOfx, descricaoDe } from './ofxParser.js';

/**
 * Os arquivos de exemplo aqui reproduzem as diferenças REAIS entre bancos —
 * principalmente tags que não fecham (OFX 1.x é SGML, não XML), que é o
 * motivo de o leitor ser escrito à mão em vez de usar um parser de XML.
 */

const OFX_TAGS_FECHADAS = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL</CURDEF>
<BANKACCTFROM><BANKID>260</BANKID><ACCTID>123456789</ACCTID></BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260805</DTPOSTED><TRNAMT>-84.90</TRNAMT><FITID>abc123</FITID><NAME>Supermercado Bom Preco</NAME></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260806</DTPOSTED><TRNAMT>3200.00</TRNAMT><FITID>abc124</FITID><NAME>Salario</NAME></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

// Itaú e BB entregam assim: nenhuma tag de campo fecha.
const OFX_TAGS_ABERTAS = `OFXHEADER:100
<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260810120000[-3:BRT]
<TRNAMT>-45,50
<FITID>XYZ987
<MEMO>PAG*Posto Shell
</STMTTRN>
</OFX>`;

describe('reconhecimento de OFX', () => {
  it('reconhece pelo cabeçalho e pela tag de transação', () => {
    expect(ehOfx(OFX_TAGS_FECHADAS)).toBe(true);
    expect(ehOfx('<STMTTRN><TRNAMT>-10</TRNAMT></STMTTRN>')).toBe(true);
  });

  it('não confunde CSV com OFX', () => {
    expect(ehOfx('data,valor,descricao\n01/08/2026,-50,mercado')).toBe(false);
    expect(ehOfx('')).toBe(false);
    expect(ehOfx(null)).toBe(false);
  });

  it('recusa arquivo que não é OFX com erro claro', () => {
    expect(() => lerOfx('qualquer coisa')).toThrow(/não parece ser um extrato OFX/);
  });
});

describe('leitura das transações', () => {
  it('lê tags fechadas e separa gasto de entrada pelo sinal', () => {
    const { transacoes, ignoradas } = lerOfx(OFX_TAGS_FECHADAS);

    expect(ignoradas).toBe(0);
    expect(transacoes).toHaveLength(2);

    expect(transacoes[0]).toMatchObject({
      data: '2026-08-05',
      descricao: 'Supermercado Bom Preco',
      tipo: 'EXPENSE',
      valor: 84.9,
      idDoBanco: 'abc123',
    });

    // Valor sempre positivo: o sinal virou o campo `tipo`.
    expect(transacoes[1]).toMatchObject({ tipo: 'INCOME', valor: 3200, data: '2026-08-06' });
  });

  it('lê OFX com tags abertas (Itaú, BB) — o caso que um parser de XML recusaria', () => {
    const { transacoes } = lerOfx(OFX_TAGS_ABERTAS);

    expect(transacoes).toHaveLength(1);
    expect(transacoes[0]).toMatchObject({
      data: '2026-08-10',
      descricao: 'PAG*Posto Shell',
      tipo: 'EXPENSE',
      valor: 45.5,
      idDoBanco: 'XYZ987',
    });
  });

  it('descarta linha sem data ou sem valor em vez de recusar o arquivo inteiro', () => {
    const misto = `<OFX>
<STMTTRN><DTPOSTED>20260805</DTPOSTED><TRNAMT>-10.00</TRNAMT><NAME>boa</NAME></STMTTRN>
<STMTTRN><TRNAMT>-20.00</TRNAMT><NAME>sem data</NAME></STMTTRN>
<STMTTRN><DTPOSTED>20260807</DTPOSTED><NAME>sem valor</NAME></STMTTRN>
</OFX>`;

    const { transacoes, ignoradas } = lerOfx(misto);
    expect(transacoes).toHaveLength(1);
    expect(ignoradas).toBe(2);
  });

  it('ignora lançamento de valor zero (ajuste neutro do banco)', () => {
    const comZero = `<OFX><STMTTRN><DTPOSTED>20260805</DTPOSTED><TRNAMT>0.00</TRNAMT><NAME>ajuste</NAME></STMTTRN></OFX>`;
    expect(lerOfx(comZero).transacoes).toHaveLength(0);
  });

  it('extrai banco e só os últimos dígitos da conta', () => {
    const { conta } = lerOfx(OFX_TAGS_FECHADAS);
    expect(conta).toMatchObject({ banco: '260', contaFinal: '6789', moeda: 'BRL' });
    expect(conta.contaFinal).not.toContain('12345');
  });
});

describe('data do OFX', () => {
  it('lê AAAAMMDD com e sem hora/fuso', () => {
    expect(dataDoOfx('20260813')).toBe('2026-08-13');
    expect(dataDoOfx('20260813120000')).toBe('2026-08-13');
    expect(dataDoOfx('20260813120000[-3:BRT]')).toBe('2026-08-13');
  });

  it('não desloca o dia por causa de fuso — o erro que jogaria o lançamento pro mês anterior', () => {
    expect(dataDoOfx('20260801')).toBe('2026-08-01');
    expect(dataDoOfx('20260101')).toBe('2026-01-01');
  });

  it('devolve null no que não é data', () => {
    expect(dataDoOfx('')).toBeNull();
    expect(dataDoOfx('abc')).toBeNull();
    expect(dataDoOfx('2026')).toBeNull();
  });
});

describe('valor do OFX', () => {
  it('lê ponto decimal e também vírgula (bancos fora do padrão)', () => {
    expect(valorDoOfx('-84.90')).toBe(-84.9);
    expect(valorDoOfx('-84,90')).toBe(-84.9);
    expect(valorDoOfx('3200.00')).toBe(3200);
  });

  it('devolve null no que não é número', () => {
    expect(valorDoOfx('')).toBeNull();
    expect(valorDoOfx('abc')).toBeNull();
    expect(valorDoOfx(null)).toBeNull();
  });
});

describe('descrição a partir de NAME e MEMO', () => {
  it('junta os dois quando trazem informações diferentes', () => {
    expect(descricaoDe({ nome: 'Mercado', memo: 'Compra parcelada' })).toBe('Mercado - Compra parcelada');
  });

  it('não repete quando um contém o outro', () => {
    expect(descricaoDe({ nome: 'Mercado', memo: 'Mercado Bom Preco' })).toBe('Mercado Bom Preco');
    expect(descricaoDe({ nome: 'Padaria', memo: 'padaria' })).toBe('Padaria');
  });

  it('usa o que existir quando só um vem preenchido', () => {
    expect(descricaoDe({ nome: 'Só nome', memo: null })).toBe('Só nome');
    expect(descricaoDe({ nome: null, memo: 'Só memo' })).toBe('Só memo');
  });
});
