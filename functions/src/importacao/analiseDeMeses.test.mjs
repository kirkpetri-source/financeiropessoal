import { describe, it, expect } from 'vitest';
import { marcarProvaveisDuplicatas, resumirMeses, RISCO } from './analiseDeMeses.js';

/**
 * O risco que estes testes protegem é o mais caro do produto: o lançamento
 * que a família fez pelo WhatsApp entrar de novo pela importação, dobrando o
 * gasto do mês sem ninguém perceber.
 */

function doExtrato(data, valor, descricao, tipo = 'EXPENSE') {
  return { data, valor, descricao, tipo };
}

function jaNoSistema(date, amount, description, origin = 'WHATSAPP', type = 'EXPENSE') {
  return { date, amount, description, origin, type };
}

describe('detecção de lançamento que já existe', () => {
  it('casa o gasto do extrato com o mesmo valor lançado pelo WhatsApp', () => {
    const r = marcarProvaveisDuplicatas(
      [doExtrato('2026-08-05', 84.9, 'Compra no débito - SUPERMERCADO BOM PRECO')],
      [jaNoSistema('2026-08-05', 84.9, 'mercado')],
    );

    expect(r[0].provavelDuplicata).toMatchObject({ descricao: 'mercado', origem: 'WHATSAPP' });
  });

  it('aceita diferença de poucos dias — o banco registra depois da compra', () => {
    const r = marcarProvaveisDuplicatas(
      [doExtrato('2026-08-07', 84.9, 'SUPERMERCADO')],
      [jaNoSistema('2026-08-05', 84.9, 'mercado')],
    );
    expect(r[0].provavelDuplicata).toBeTruthy();
  });

  it('não casa quando a distância passa da tolerância', () => {
    const r = marcarProvaveisDuplicatas(
      [doExtrato('2026-08-20', 84.9, 'SUPERMERCADO')],
      [jaNoSistema('2026-08-05', 84.9, 'mercado')],
    );
    expect(r[0].provavelDuplicata).toBeNull();
  });

  it('não casa valores diferentes, mesmo no mesmo dia', () => {
    const r = marcarProvaveisDuplicatas(
      [doExtrato('2026-08-05', 84.9, 'SUPERMERCADO')],
      [jaNoSistema('2026-08-05', 90.0, 'mercado')],
    );
    expect(r[0].provavelDuplicata).toBeNull();
  });

  it('não confunde gasto com entrada de mesmo valor', () => {
    const r = marcarProvaveisDuplicatas(
      [doExtrato('2026-08-05', 100, 'Pix recebido', 'INCOME')],
      [jaNoSistema('2026-08-05', 100, 'pagamento', 'WHATSAPP', 'EXPENSE')],
    );
    expect(r[0].provavelDuplicata).toBeNull();
  });

  // Sem isto, três compras de R$ 50 no mesmo dia marcariam umas às outras e
  // duas compras reais sumiriam da importação.
  it('cada lançamento existente casa com no máximo uma linha do extrato', () => {
    const r = marcarProvaveisDuplicatas(
      [
        doExtrato('2026-08-05', 50, 'PADARIA'),
        doExtrato('2026-08-05', 50, 'FARMACIA'),
        doExtrato('2026-08-05', 50, 'POSTO'),
      ],
      [jaNoSistema('2026-08-05', 50, 'padaria')],
    );

    expect(r.filter((t) => t.provavelDuplicata)).toHaveLength(1);
  });

  it('casa contra lançamento de qualquer origem, não só WhatsApp', () => {
    const r = marcarProvaveisDuplicatas(
      [doExtrato('2026-08-05', 84.9, 'SUPERMERCADO')],
      [jaNoSistema('2026-08-05', 84.9, 'mercado', 'MANUAL')],
    );
    expect(r[0].provavelDuplicata.origem).toBe('MANUAL');
  });

  it('sem nada no sistema, nada é marcado', () => {
    const r = marcarProvaveisDuplicatas([doExtrato('2026-08-05', 84.9, 'X')], []);
    expect(r[0].provavelDuplicata).toBeNull();
  });
});

describe('resumo por mês', () => {
  const extrato = [
    doExtrato('2026-06-10', 100, 'A'),
    doExtrato('2026-06-20', 200, 'B'),
    doExtrato('2026-07-05', 84.9, 'C'),
  ];

  it('mês sem lançamento nenhum é território livre', () => {
    const meses = resumirMeses(extrato, {});
    expect(meses.every((m) => m.risco === RISCO.LIVRE)).toBe(true);
    expect(meses.map((m) => m.mes)).toEqual(['2026-06', '2026-07']);
  });

  it('mês que já tem lançamentos é marcado para atenção', () => {
    const meses = resumirMeses(extrato, { '2026-07': { quantidade: 12, totalGastos: 3400 } });

    const julho = meses.find((m) => m.mes === '2026-07');
    expect(julho.risco).toBe(RISCO.COM_DADOS);
    expect(julho.jaExiste).toMatchObject({ quantidade: 12, totalGastos: 3400 });

    // O mês anterior continua livre: o risco é avaliado mês a mês.
    expect(meses.find((m) => m.mes === '2026-06').risco).toBe(RISCO.LIVRE);
  });

  it('mostra como o total do mês fica DEPOIS — é o número que faz decidir', () => {
    const meses = resumirMeses(extrato, { '2026-07': { quantidade: 12, totalGastos: 3400 } });
    const julho = meses.find((m) => m.mes === '2026-07');

    expect(julho.totalGastos).toBe(84.9);          // o que o extrato traz
    expect(julho.totalGastosDepois).toBe(3484.9);  // como o mês fica
  });

  it('sugere importar tudo no mês livre e excluir as prováveis duplicatas no mês com dados', () => {
    const comDuplicata = [
      { ...doExtrato('2026-07-05', 84.9, 'C'), provavelDuplicata: { descricao: 'mercado' } },
      { ...doExtrato('2026-07-06', 50, 'D'), provavelDuplicata: null },
    ];

    const meses = resumirMeses(comDuplicata, { '2026-07': { quantidade: 12, totalGastos: 3400 } });
    const julho = meses[0];

    expect(julho.quantidade).toBe(2);
    expect(julho.provaveisDuplicatas).toBe(1);
    expect(julho.sugestaoImportar).toBe(1); // só a que não parece repetida
  });

  it('separa gastos de entradas no resumo', () => {
    const meses = resumirMeses([
      doExtrato('2026-06-10', 100, 'gasto'),
      doExtrato('2026-06-11', 5000, 'salario', 'INCOME'),
    ], {});

    expect(meses[0]).toMatchObject({ totalGastos: 100, totalEntradas: 5000 });
  });
});
