import { describe, it, expect } from 'vitest';
import { lerExtrato, detectarFormato, impressaoDigital, LIMITE_DE_LINHAS } from './leitorDeExtrato.js';

/**
 * A impressão digital é o que impede o mesmo gasto de entrar duas vezes
 * quando a pessoa importa "agosto" e depois "julho a setembro". Lançamento
 * duplicado num app de finanças corrompe o saldo, que é a única coisa que o
 * produto realmente vende — por isso a cobertura aqui é do dedupe, mais que
 * da leitura em si (já coberta nos testes de cada parser).
 */

const OFX = `OFXHEADER:100
<OFX><STMTTRN><DTPOSTED>20260805</DTPOSTED><TRNAMT>-84.90</TRNAMT><FITID>UNICO-1</FITID><NAME>Mercado</NAME></STMTTRN></OFX>`;

const CSV = `Data,Valor,Descrição
05/08/2026,-84.90,Mercado`;

describe('detecção de formato pelo conteúdo', () => {
  it('reconhece OFX e CSV sem olhar a extensão do arquivo', () => {
    expect(detectarFormato(OFX)).toBe('ofx');
    expect(detectarFormato(CSV)).toBe('csv');
  });

  it('devolve null para o que não é extrato', () => {
    expect(detectarFormato('bom dia, tudo bem?')).toBeNull();
  });

  it('erro claro quando o arquivo não é reconhecido', () => {
    expect(() => lerExtrato('bom dia')).toThrow(/OFX ou CSV/);
    expect(() => lerExtrato('')).toThrow(/vazio/i);
  });
});

describe('impressão digital', () => {
  it('usa o ID do banco quando existe — é único e estável', () => {
    const a = impressaoDigital({ data: '2026-08-05', valor: 84.9, descricao: 'Mercado', idDoBanco: 'FIT-1' });
    const b = impressaoDigital({ data: '2026-08-06', valor: 99.9, descricao: 'Outra coisa', idDoBanco: 'FIT-1' });

    // Mesmo ID do banco = mesma transação, mesmo com outros campos diferentes.
    expect(a).toBe(b);
  });

  it('sem ID do banco, calcula por data + valor + descrição', () => {
    const base = { data: '2026-08-05', valor: 84.9, descricao: 'Mercado', idDoBanco: null };
    expect(impressaoDigital(base)).toBe(impressaoDigital({ ...base }));
    expect(impressaoDigital(base)).not.toBe(impressaoDigital({ ...base, valor: 84.91 }));
    expect(impressaoDigital(base)).not.toBe(impressaoDigital({ ...base, data: '2026-08-06' }));
  });

  it('ignora ruído variável da descrição — a MESMA compra reimportada tem a mesma digital', () => {
    // O banco põe NSU/autorização diferente na mesma compra em exportações
    // distintas. Se isso entrasse na digital, o dedupe nunca funcionaria.
    const a = impressaoDigital({ data: '2026-08-05', valor: 84.9, descricao: 'MERCADO BOM PRECO NSU 123', idDoBanco: null });
    const b = impressaoDigital({ data: '2026-08-05', valor: 84.9, descricao: 'MERCADO BOM PRECO NSU 999', idDoBanco: null });
    expect(a).toBe(b);
  });

  it('diferencia estabelecimentos diferentes no mesmo dia e valor', () => {
    const a = impressaoDigital({ data: '2026-08-05', valor: 50, descricao: 'Padaria', idDoBanco: null });
    const b = impressaoDigital({ data: '2026-08-05', valor: 50, descricao: 'Farmacia', idDoBanco: null });
    expect(a).not.toBe(b);
  });
});

describe('leitura completa', () => {
  it('anexa a digital em toda transação', () => {
    const { transacoes } = lerExtrato(OFX);
    expect(transacoes[0].digital).toBeTruthy();
    expect(transacoes[0].digital).toHaveLength(32);
  });

  it('informa o período coberto para a pessoa conferir se é o mês certo', () => {
    const varias = `Data,Valor,Descrição
05/08/2026,-10.00,A
20/08/2026,-20.00,B
12/08/2026,-30.00,C`;
    expect(lerExtrato(varias).periodo).toEqual({ de: '2026-08-05', ate: '2026-08-20' });
  });

  it('aponta repetição dentro do próprio arquivo', () => {
    const repetido = `Data,Valor,Descrição
05/08/2026,-84.90,Mercado
05/08/2026,-84.90,Mercado
06/08/2026,-10.00,Padaria`;

    const { duplicatasNoArquivo, transacoes } = lerExtrato(repetido);
    expect(transacoes).toHaveLength(3);
    expect(duplicatasNoArquivo).toHaveLength(1);
  });

  it('identifica o formato lido', () => {
    expect(lerExtrato(OFX).formato).toBe('ofx');
    expect(lerExtrato(CSV).formato).toBe('csv');
  });

  it('recusa arquivo absurdamente grande com instrução do que fazer', () => {
    const linhas = ['Data,Valor,Descrição'];
    for (let i = 0; i < LIMITE_DE_LINHAS + 10; i++) {
      linhas.push(`05/08/2026,-${(i % 90) + 10}.00,Compra numero ${i}`);
    }
    expect(() => lerExtrato(linhas.join('\n'))).toThrow(/divida por período/i);
  });
});
