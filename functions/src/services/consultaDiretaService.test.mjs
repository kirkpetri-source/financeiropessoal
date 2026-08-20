import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarConsultaDireta } from './consultaDiretaService.js';

/**
 * A camada que responde SEM IA.
 *
 * O que estes testes protegem é a propriedade mais cara desta camada: o número
 * que ela mostra tem que ser o número que a agregação devolveu. Um bug aqui não
 * dá erro — entrega valor errado com cara de exato, ao lado de uma resposta bem
 * formatada. Foi o que aconteceu duas vezes em produção (o total da listagem
 * somava só os 12 itens exibidos; o comparativo comparava um mês com ele mesmo).
 */

const dados = { householdId: 'fam-1' };
const MES = '2026-08';

let consulta;

function montar(sobrescrever = {}) {
  consulta = {
    montarVocabulario: vi.fn(async () => ([
      { categoria: 'Mercado', tipo: 'EXPENSE', subcategorias: ['Padaria'] },
      { categoria: 'Moradia', tipo: 'EXPENSE', subcategorias: [] },
    ])),
    resumoDoMes: vi.fn(async () => ({
      mes: MES, receitas: 5000, gastos: 3200, saldo: 1800,
      quantidadeDeLancamentos: 12,
      porPessoa: [
        { pessoa: 'Kirk', receitas: 5000, gastos: 2000 },
        { pessoa: 'Raquel', receitas: 0, gastos: 1200 },
      ],
    })),
    gastoPorCategoria: vi.fn(async () => ({
      mes: MES, totalDeGastosNoMes: 3200,
      categorias: [
        { categoria: 'Mercado', total: 1369.31, fatiaDoMes: 43, subcategorias: [{ subcategoria: 'Padaria', total: 153 }] },
        { categoria: 'Moradia', total: 1830.69, fatiaDoMes: 57, subcategorias: [] },
      ],
    })),
    listarLancamentos: vi.fn(async () => ({
      mes: MES, quantidadeTotal: 35, mostrando: 12,
      lancamentos: Array.from({ length: 12 }, (_, i) => ({
        data: `${MES}-1${i % 10}`, descricao: `compra ${i}`, valor: 10, tipo: 'EXPENSE',
      })),
    })),
    compararPeriodos: vi.fn(async () => ({
      de: '2026-07', para: MES, totalDe: 2000, totalPara: 3200, variacaoTotal: 1200,
      porCategoria: [
        { categoria: 'Mercado', variacao: 900, variacaoPercentual: 40 },
        { categoria: 'Lazer', variacao: -100, variacaoPercentual: -20 },
      ],
    })),
    gastoPorPessoa: vi.fn(async () => ({
      periodo: 'os últimos 7 dias', total: 470, categoria: null,
      pessoas: [
        { pessoa: 'Kirk', total: 280, quantidade: 2, fatia: 60, categorias: [{ categoria: 'Mercado', total: 280 }] },
        { pessoa: 'Raquel', total: 190, quantidade: 2, fatia: 40, categorias: [{ categoria: 'Mercado', total: 190 }] },
      ],
    })),
    ...sobrescrever,
  };
  return criarConsultaDireta({ consulta });
}

const perguntar = (svc, pergunta, canal = 'WHATSAPP') =>
  svc.responder({ dados, pergunta, canal, nomeDaIA: 'Nina', mesCorrente: MES });

beforeEach(() => { vi.clearAllMocks(); });

describe('o número mostrado é o número da agregação', () => {
  it('gasto de categoria', async () => {
    const r = await perguntar(montar(), 'quanto gastei no mercado esse mês?');
    expect(r.texto).toContain('1.369,31');
    expect(r.texto).toContain('43%');
  });

  it('resumo do mês traz receita, despesa e saldo', async () => {
    const r = await perguntar(montar(), 'quanto gastei esse mês no total');
    expect(r.texto).toContain('5.000,00');
    expect(r.texto).toContain('3.200,00');
    expect(r.texto).toContain('1.800,00');
  });

  it('resumo quebra por pessoa quando há mais de uma', async () => {
    const r = await perguntar(montar(), 'qual o saldo do mês');
    expect(r.texto).toContain('Kirk');
    expect(r.texto).toContain('Raquel');
  });

  /**
   * O bug real: a listagem somava os 12 lançamentos EXIBIDOS e mostrava isso
   * como total. Em produção respondeu R$ 903,17 quando o mês tinha R$ 1.369,31.
   */
  it('a lista usa o total da AGREGAÇÃO, não a soma do que exibiu', async () => {
    const r = await perguntar(montar(), 'detalhe os gastos de mercado');
    // 12 itens de R$ 10 somariam R$ 120; o total certo é o da agregação.
    expect(r.texto).toContain('1.369,31');
    expect(r.texto).not.toContain('120,00');
  });

  it('lista truncada avisa que está truncada', async () => {
    const r = await perguntar(montar(), 'detalhe os gastos de mercado');
    expect(r.texto).toContain('12 de 35');
  });
});

describe('relatório por pessoa', () => {
  it('mostra cada pessoa com total e fatia', async () => {
    const r = await perguntar(montar(), 'quanto cada um gastou essa semana');
    expect(r.texto).toContain('Kirk');
    expect(r.texto).toContain('280,00');
    expect(r.texto).toContain('60%');
    expect(r.texto).toContain('470,00');
  });

  it('repassa o recorte em dias para a agregação', async () => {
    const svc = montar();
    await perguntar(svc, 'quanto cada um gastou hoje');
    expect(consulta.gastoPorPessoa).toHaveBeenCalledWith(dados,
      expect.objectContaining({ dias: 1 }));
  });

  it('sem gasto no período, diz isso em vez de mostrar lista vazia', async () => {
    const svc = montar({
      gastoPorPessoa: vi.fn(async () => ({ periodo: 'hoje', total: 0, pessoas: [] })),
    });
    const r = await perguntar(svc, 'quanto cada um gastou hoje');
    expect(r.texto).toContain('Não há gastos');
  });
});

describe('comparativo', () => {
  it('aponta os dois meses e o que subiu', async () => {
    const svc = montar();
    const r = await perguntar(svc, 'compare com o mês passado');
    expect(r.texto).toContain('julho');
    expect(r.texto).toContain('agosto');
    expect(r.texto).toContain('Mercado');
    // O bug antigo: mesA e mesB iguais.
    expect(consulta.compararPeriodos).toHaveBeenCalledWith(dados,
      expect.objectContaining({ mesA: '2026-07', mesB: '2026-08' }));
  });
});

describe('devolve null quando não é consulta — e aí a IA assume', () => {
  const naoResponde = async (t) => expect(await perguntar(montar(), t)).toBeNull();

  it('conselho', async () => {
    await naoResponde('como posso economizar?');
    await naoResponde('vale a pena cortar mercado?');
  });

  it('aritmética', async () => {
    await naoResponde('quanto é 15% do que gastei no mercado?');
  });

  it('recorte que as agregações mensais não fazem', async () => {
    await naoResponde('quanto gastei no mercado essa semana?');
    await naoResponde('quanto gastei ontem');
  });

  it('pergunta que não reconhece', async () => {
    await naoResponde('quem é Raquel?');
    await naoResponde('me conta uma novidade');
  });

  it('pergunta vazia', async () => {
    await naoResponde('');
    await naoResponde('   ');
  });

  it('não chama agregação nenhuma quando devolve null', async () => {
    const svc = montar();
    await perguntar(svc, 'como posso economizar?');
    expect(consulta.gastoPorCategoria).not.toHaveBeenCalled();
    expect(consulta.resumoDoMes).not.toHaveBeenCalled();
  });
});

describe('formato por canal', () => {
  it('WhatsApp usa um asterisco', async () => {
    const r = await perguntar(montar(), 'quanto gastei no mercado esse mês?', 'WHATSAPP');
    expect(r.texto).toMatch(/\*[^*]+\*/);
    expect(r.texto).not.toContain('**');
  });

  it('painel usa markdown', async () => {
    const r = await perguntar(montar(), 'quanto gastei no mercado esse mês?', 'PAINEL');
    expect(r.texto).toContain('**');
  });
});

describe('a identidade não custa consulta nenhuma', () => {
  it('responde o nome sem tocar no banco', async () => {
    const svc = montar();
    const r = await perguntar(svc, 'qual seu nome?');
    expect(r.texto).toContain('Nina');
    expect(r.consultasUsadas).toEqual([]);
    expect(consulta.resumoDoMes).not.toHaveBeenCalled();
  });
});
