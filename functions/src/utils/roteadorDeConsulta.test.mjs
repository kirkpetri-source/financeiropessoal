import { describe, it, expect } from 'vitest';
import { rotearConsulta, INTENCAO, extrairMes, deslocarMes } from './roteadorDeConsulta.js';

/**
 * O roteador de consulta é a peça de maior risco desta camada: ele decide
 * quando NÃO chamar a IA. Errar para o lado de responder sozinho é entregar
 * número errado com cara de certo, que num app de dinheiro é o pior resultado
 * possível.
 *
 * Por isso a maior parte destes testes verifica o que ele RECUSA.
 */

const CATEGORIAS = [
  'Mercado', 'Moradia', 'Combustível', 'Lazer', 'Saúde', 'Educação',
  'Internet', 'Cartão de Crédito', 'Alimentação',
];

const ctx = { categorias: CATEGORIAS, mesCorrente: '2026-08', nomeDaIA: 'Nina' };
const rotear = (texto) => rotearConsulta(texto, ctx);

describe('perguntas que a camada direta RESOLVE', () => {
  it('total de uma categoria', () => {
    const r = rotear('Quanto gastei no mercado esse mês?');
    expect(r.intencao).toBe(INTENCAO.GASTO_CATEGORIA);
    expect(r.parametros.categoria).toBe('Mercado');
  });

  it('total de categoria em mês nomeado', () => {
    const r = rotear('quanto gastei em lazer em julho');
    expect(r.intencao).toBe(INTENCAO.GASTO_CATEGORIA);
    expect(r.parametros.mes).toBe('2026-07');
  });

  it('detalhe de uma categoria vira lista', () => {
    const r = rotear('Detalhe os gastos de moradia');
    expect(r.intencao).toBe(INTENCAO.LISTAR_LANCAMENTOS);
    expect(r.parametros.categoria).toBe('Moradia');
  });

  it('quebra do mês por categoria', () => {
    expect(rotear('abre agosto por categoria').intencao).toBe(INTENCAO.POR_CATEGORIA);
    expect(rotear('me mostra os gastos por categoria').intencao).toBe(INTENCAO.POR_CATEGORIA);
  });

  it('onde estou gastando demais', () => {
    expect(rotear('Me mostra onde estou gastando demais').intencao).toBe(INTENCAO.MAIOR_GASTO);
    expect(rotear('qual minha maior categoria de gasto').intencao).toBe(INTENCAO.MAIOR_GASTO);
  });

  it('comparativo entre meses', () => {
    const r = rotear('Compare meus gastos desse mês com o mês passado');
    expect(r.intencao).toBe(INTENCAO.COMPARATIVO);
  });

  it('resumo do mês', () => {
    expect(rotear('quanto gastei esse mês no total').intencao).toBe(INTENCAO.RESUMO_MES);
    expect(rotear('qual o saldo do mês').intencao).toBe(INTENCAO.RESUMO_MES);
  });

  it('o nome da assistente não custa uma chamada de IA', () => {
    const r = rotear('Qual seu nome ?');
    expect(r.intencao).toBe(INTENCAO.IDENTIDADE);
    expect(r.parametros.nomeDaIA).toBe('Nina');
  });
});

describe('perguntas que TÊM que ir para a IA', () => {
  const vaiParaIA = (t) => expect(rotear(t)).toBeNull();

  it('conselho, mesmo citando categoria', () => {
    vaiParaIA('Como posso economizar em mercado?');
    vaiParaIA('como reduzir meus gastos');
    vaiParaIA('como aumentar minha receita');
    vaiParaIA('vale a pena cortar assinaturas?');
    vaiParaIA('me ajuda a montar um plano');
  });

  it('julgamento sobre o valor não é consulta', () => {
    vaiParaIA('gastei 300 no mercado, tá muito?');
    vaiParaIA('meu gasto com lazer está alto?');
  });

  // A barreira mais importante: as agregações trabalham por MÊS. Responder
  // "essa semana" com o total do mês seria número errado com cara de certo.
  it('recorte de tempo que as agregações não fazem', () => {
    vaiParaIA('quanto gastei no mercado essa semana?');
    vaiParaIA('quanto gastei ontem');
    vaiParaIA('quanto gastei hoje em alimentação');
    vaiParaIA('quanto gastei nos últimos 15 dias');
    vaiParaIA('quanto gastei esse ano');
  });

  it('aritmética é da IA — a camada direta não calcula', () => {
    vaiParaIA('quanto é 15% do que gastei no mercado?');
    vaiParaIA('qual a média de gasto em mercado');
    vaiParaIA('se eu cortar metade do lazer, quanto sobra?');
  });

  it('pergunta genérica sem intenção reconhecível', () => {
    vaiParaIA('e aí, tudo bem?');
    vaiParaIA('me conta uma novidade');
    vaiParaIA('o que você sabe fazer');
    vaiParaIA('quem é Raquel?');
  });

  it('categoria citada sem perguntar valor nem pedir lista', () => {
    vaiParaIA('mercado');
    vaiParaIA('lembra do mercado');
  });

  it('mensagem vazia ou sem mês corrente', () => {
    expect(rotear('')).toBeNull();
    expect(rotearConsulta('quanto gastei em mercado', { categorias: CATEGORIAS })).toBeNull();
  });
});

describe('a categoria vem do banco, não de lista fixa', () => {
  it('só casa categoria que a família realmente tem', () => {
    const semMercado = rotearConsulta('quanto gastei no mercado esse mês', {
      ...ctx, categorias: ['Moradia', 'Lazer'],
    });
    // Sem "Mercado" cadastrado, não há o que consultar: vai para a IA.
    expect(semMercado).toBeNull();
  });

  it('não casa categoria dentro de outra palavra', () => {
    // "net" não pode casar em "internet" — armadilha já paga no parser.
    const r = rotearConsulta('quanto gastei em internet esse mês', {
      ...ctx, categorias: ['Internet', 'Net'],
    });
    expect(r.parametros.categoria).toBe('Internet');
  });

  it('prefere o nome mais longo', () => {
    const r = rotearConsulta('quanto gastei em cartão de crédito esse mês', {
      ...ctx, categorias: ['Cartão de Crédito', 'Cartão'],
    });
    expect(r.parametros.categoria).toBe('Cartão de Crédito');
  });
});

describe('extração de mês', () => {
  it('mês passado e retrasado', () => {
    expect(extrairMes('mes passado', '2026-08')).toBe('2026-07');
    expect(extrairMes('mes retrasado', '2026-08')).toBe('2026-06');
  });

  it('vira o ano corretamente', () => {
    expect(extrairMes('mes passado', '2026-01')).toBe('2025-12');
  });

  it('mês nomeado que ainda não chegou é do ano passado', () => {
    // Em agosto, "dezembro" é o que passou, não o que vem.
    expect(extrairMes('em dezembro', '2026-08')).toBe('2025-12');
    expect(extrairMes('em julho', '2026-08')).toBe('2026-07');
  });

  it('aceita AAAA-MM escrito', () => {
    expect(extrairMes('em 2026-03', '2026-08')).toBe('2026-03');
  });

  it('sem menção de mês devolve undefined (usa o corrente)', () => {
    expect(extrairMes('quanto gastei em mercado', '2026-08')).toBeUndefined();
  });
});

describe('deslocarMes', () => {
  it('anda para trás e para frente virando o ano', () => {
    expect(deslocarMes('2026-01', -1)).toBe('2025-12');
    expect(deslocarMes('2026-12', 1)).toBe('2027-01');
    expect(deslocarMes('2026-08', -3)).toBe('2026-05');
  });
});

/**
 * Comparativo — dois bugs reais do teste ao vivo de 20/08/2026.
 *
 * "Compare com o mês passado" respondeu "julho de 2026 contra julho de 2026,
 * diferença R$ 0,00": o mês citado ia como `mesB`, e `mesA` caía no padrão
 * "anterior ao corrente", que era o MESMO mês.
 */
describe('comparativo aponta para os meses certos', () => {
  it('"mês passado" compara o anterior com o corrente', () => {
    const r = rotear('Compare com o mês passado');
    expect(r.intencao).toBe(INTENCAO.COMPARATIVO);
    expect(r.parametros.mesA).toBe('2026-07');
    expect(r.parametros.mesB).toBe('2026-08');
  });

  it('"compare" sozinho também usa o mês anterior', () => {
    const r = rotear('compare meus gastos');
    expect(r.parametros.mesA).toBe('2026-07');
    expect(r.parametros.mesB).toBe('2026-08');
  });

  it('mês nomeado vira a base da comparação', () => {
    const r = rotear('compare com junho');
    expect(r.parametros.mesA).toBe('2026-06');
    expect(r.parametros.mesB).toBe('2026-08');
  });

  it('nunca compara um mês com ele mesmo', () => {
    // "compare com agosto" estando em agosto não tem o que comparar.
    expect(rotear('compare com agosto')).toBeNull();
  });

  it('frase com DOIS meses vai para a IA', () => {
    // Saber qual é base e qual é alvo exige entender a frase, não achar palavra.
    expect(rotear('compara agosto com julho')).toBeNull();
    expect(rotear('compare junho com julho')).toBeNull();
  });
});

/**
 * Relatório por pessoa — a única intenção que aceita recorte em dias, porque é
 * a única com agregação que sabe fazer isso (`gastoPorPessoa`).
 *
 * Antes disso, "quanto cada um gastou essa semana" ia para a IA somar a lista
 * crua — que vem cortada em 40 itens, então numa família ativa a soma sairia
 * MENOR que a real, sem avisar.
 */
describe('relatório por pessoa', () => {
  it('reconhece as várias formas de pedir', () => {
    for (const t of ['quanto cada um gastou esse mês', 'relatório separado por pessoa',
      'quem gastou mais', 'quanto cada pessoa gastou', 'gastos por usuário']) {
      expect(rotear(t)?.intencao).toBe(INTENCAO.POR_PESSOA);
    }
  });

  it('traduz o recorte em dias', () => {
    expect(rotear('quanto cada um gastou hoje').parametros.dias).toBe(1);
    expect(rotear('quanto cada um gastou essa semana').parametros.dias).toBe(7);
    expect(rotear('quanto cada um gastou nos últimos 15 dias').parametros.dias).toBe(15);
    expect(rotear('quanto cada um gastou nos últimos 20 dias').parametros.dias).toBe(20);
  });

  it('sem recorte em dias, usa o mês', () => {
    const r = rotear('me dá um relatório do mês separado por pessoa');
    expect(r.parametros.dias).toBeUndefined();
    expect(r.parametros.mes).toBeUndefined(); // mês corrente
  });

  it('filtra por categoria quando citada', () => {
    expect(rotear('quem gastou mais em mercado esse mês').parametros.categoria).toBe('Mercado');
  });

  // "Ontem" é UM dia, não uma janela até hoje. Responder "últimos 2 dias"
  // incluiria hoje — número errado com cara de certo.
  it('"ontem" continua indo para a IA', () => {
    expect(rotear('quanto cada um gastou ontem')).toBeNull();
  });

  it('recorte que não sei traduzir vai para a IA', () => {
    expect(rotear('quanto cada um gastou esse ano')).toBeNull();
    expect(rotear('quanto cada um gastou no trimestre')).toBeNull();
  });

  // A barreira das OUTRAS intenções continua de pé: elas só fazem mês.
  it('não afrouxa o recorte das outras perguntas', () => {
    expect(rotear('quanto gastei essa semana')).toBeNull();
    expect(rotear('quanto gastei no mercado essa semana')).toBeNull();
  });
});
