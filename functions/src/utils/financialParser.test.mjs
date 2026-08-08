import { describe, it, expect } from 'vitest';
import parser from './financialParser.js';

const { parseFinancialMessage, suggestCategory, looksLikeFinancialMessage, parseBrazilianAmount } = parser;

const PAGADORES = [
  { name: 'Kirk', phone: '5564999555364' },
  { name: 'Raquel', phone: '5564999919124' },
];

describe('parseBrazilianAmount', () => {
  it('lê vírgula como separador decimal', () => {
    expect(parseBrazilianAmount('84,90')).toBe(84.9);
    expect(parseBrazilianAmount('0,50')).toBe(0.5);
  });

  it('lê ponto como separador de milhar quando não há vírgula', () => {
    expect(parseBrazilianAmount('1.500')).toBe(1500);
    expect(parseBrazilianAmount('1.234.567')).toBe(1234567);
  });

  it('combina milhar e decimal no formato brasileiro', () => {
    expect(parseBrazilianAmount('1.500,00')).toBe(1500);
    expect(parseBrazilianAmount('12.345,67')).toBe(12345.67);
  });

  it('remove o símbolo de moeda colado ao número', () => {
    expect(parseBrazilianAmount('R$50')).toBe(50);
    expect(parseBrazilianAmount('r$1.200,50')).toBe(1200.5);
    expect(parseBrazilianAmount('$30')).toBe(30);
  });

  it('preserva decimal com ponto quando não é grupo de milhar', () => {
    expect(parseBrazilianAmount('1.5')).toBe(1.5);
    expect(parseBrazilianAmount('84.90')).toBe(84.9);
  });

  it('devolve NaN para texto que não é número', () => {
    expect(parseBrazilianAmount('mercado')).toBeNaN();
  });

  // parseFloat('10x') devolve 10, e isso fazia "geladeira 1200 em 10x" ser
  // lancada como R$ 10 em vez de R$ 1.200.
  it('recusa numero com letra colada', () => {
    expect(parseBrazilianAmount('10x')).toBeNaN();
    expect(parseBrazilianAmount('12vezes')).toBeNaN();
    expect(parseBrazilianAmount('3kg')).toBeNaN();
    expect(parseBrazilianAmount('2h')).toBeNaN();
  });
});

describe('parseFinancialMessage — formato básico', () => {
  it('interpreta despesa com valor e forma de pagamento', () => {
    const r = parseFinancialMessage('gasto mercado 84,90 pix');
    expect(r).toMatchObject({
      type: 'EXPENSE',
      description: 'mercado',
      amount: 84.9,
      paymentMethodName: 'Pix',
      categoryName: 'Mercado',
    });
  });

  // Achado em produção (08/08/2026): um áudio dizendo "gastei trident 4,50"
  // virou R$50 porque o Gemini transcrevia o valor falado como "4 e 50" (dois
  // números soltos) em vez de "4,50" — o parser pegava só o último ("50") e
  // descartava o "4". Corrigido no prompt de transcrição (midiaParserService),
  // não aqui: este teste garante que "4,50" como token único sempre foi
  // interpretado certo, então a causa raiz era mesmo a transcrição.
  it('lê valor decimal colado em vez de separado em dois números', () => {
    const r = parseFinancialMessage('gastei trident 4,50');
    expect(r.amount).toBe(4.5);
    expect(r.description).toBe('trident');
  });

  it('interpreta receita', () => {
    const r = parseFinancialMessage('receita manutenção notebook 250 pix');
    expect(r).toMatchObject({
      type: 'INCOME',
      amount: 250,
      paymentMethodName: 'Pix',
      categoryName: 'Serviços',
    });
  });

  it('aceita todos os sinônimos de despesa', () => {
    for (const palavra of ['gasto', 'despesa', 'paguei', 'gastei', 'comprei', 'pagamento', 'saída', 'saida']) {
      const r = parseFinancialMessage(`${palavra} mercado 50 pix`);
      expect(r, palavra).not.toBeNull();
      expect(r.type, palavra).toBe('EXPENSE');
    }
  });

  it('aceita todos os sinônimos de receita', () => {
    for (const palavra of ['receita', 'entrada', 'recebi', 'ganhei', 'recebimento', 'ganho']) {
      const r = parseFinancialMessage(`${palavra} venda 800 dinheiro`);
      expect(r, palavra).not.toBeNull();
      expect(r.type, palavra).toBe('INCOME');
    }
  });

  // ESTADO.md (sessão de 06/08/2026): falha real observada em teste — a
  // primeira palavra precisa ser um verbo/substantivo de tipo, e "pagamento"
  // não estava na lista mesmo com "paguei"/"pago" já cobertos.
  it('interpreta "Pagamento cartão 1830" como despesa de R$ 1830 em Cartão de Crédito', () => {
    const r = parseFinancialMessage('Pagamento cartão 1830');
    expect(r).not.toBeNull();
    expect(r.type).toBe('EXPENSE');
    expect(r.amount).toBe(1830);
    expect(r.categoryName).toBe('Cartão de Crédito');
  });

  it('normaliza a forma de pagamento com e sem acento', () => {
    expect(parseFinancialMessage('gasto almoço 35 credito').paymentMethodName).toBe('Crédito');
    expect(parseFinancialMessage('gasto almoço 35 crédito').paymentMethodName).toBe('Crédito');
    expect(parseFinancialMessage('gasto almoço 35 debito').paymentMethodName).toBe('Débito');
  });

  it('deixa a forma de pagamento nula quando não informada', () => {
    expect(parseFinancialMessage('gasto mercado 84,90').paymentMethodName).toBeNull();
  });

  it('remove palavras de ruído da descrição', () => {
    expect(parseFinancialMessage('gasto 50 reais de gasolina pix').description).toBe('gasolina');
  });

  it('devolve null quando não há palavra de tipo no início', () => {
    expect(parseFinancialMessage('mercado 84,90 pix')).toBeNull();
  });

  it('devolve null quando não há valor', () => {
    expect(parseFinancialMessage('gasto mercado pix')).toBeNull();
  });

  it('devolve null para entrada inválida', () => {
    expect(parseFinancialMessage('')).toBeNull();
    expect(parseFinancialMessage(null)).toBeNull();
    expect(parseFinancialMessage('gasto')).toBeNull();
  });

  it('preenche referenceMonth no formato AAAA-MM', () => {
    expect(parseFinancialMessage('gasto mercado 10 pix').referenceMonth).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('parseFinancialMessage — identificação do pagador', () => {
  it('detecta o pagador no fim da mensagem, depois da forma de pagamento', () => {
    const r = parseFinancialMessage('gasto mercado 84,90 pix raquel', PAGADORES);
    expect(r.paidBy).toBe('Raquel');
    expect(r.description).toBe('mercado');
  });

  it('detecta o pagador no meio da descrição', () => {
    const r = parseFinancialMessage('gasto mercado café da manhã Raquel 30 pix', PAGADORES);
    expect(r.paidBy).toBe('Raquel');
    expect(r.description).not.toContain('Raquel');
  });

  it('ignora maiúsculas e minúsculas no nome', () => {
    expect(parseFinancialMessage('gasto uber 25 pix KIRK', PAGADORES).paidBy).toBe('Kirk');
  });

  it('deixa paidBy nulo quando nenhum pagador é citado', () => {
    expect(parseFinancialMessage('gasto uber 25 pix', PAGADORES).paidBy).toBeNull();
  });

  it('aceita lista de pagadores como array de strings', () => {
    expect(parseFinancialMessage('gasto uber 25 pix raquel', ['Kirk', 'Raquel']).paidBy).toBe('Raquel');
  });
});

describe('suggestCategory', () => {
  const casos = [
    ['compras no supermercado', 'EXPENSE', 'Mercado'],
    ['gasolina do carro', 'EXPENSE', 'Combustível'],
    ['ifood da noite', 'EXPENSE', 'Alimentação'],
    ['decio churrascaria', 'EXPENSE', 'Alimentação'],
    ['padaria da esquina', 'EXPENSE', 'Alimentação'],
    ['açougue', 'EXPENSE', 'Alimentação'],
    ['conta de energia', 'EXPENSE', 'Energia'],
    ['internet fibra', 'EXPENSE', 'Internet'],
    ['remédio da farmácia', 'EXPENSE', 'Farmácia'],
    ['uber pro centro', 'EXPENSE', 'Transporte'],
    ['dízimo', 'EXPENSE', 'Igreja/Doações'],
    ['netflix', 'EXPENSE', 'Assinaturas'],
    ['aluguel', 'EXPENSE', 'Moradia'],
    ['salário', 'INCOME', 'Salário'],
    ['venda de celular', 'INCOME', 'Vendas'],
  ];

  for (const [descricao, tipo, esperado] of casos) {
    it(`classifica "${descricao}" como ${esperado}`, () => {
      expect(suggestCategory(descricao, tipo)).toBe(esperado);
    });
  }

  it('cai em Outros quando nada casa', () => {
    expect(suggestCategory('xyzabc', 'EXPENSE')).toBe('Outros');
  });
});

describe('looksLikeFinancialMessage', () => {
  it('aceita lançamento que não começa com palavra de tipo', () => {
    expect(looksLikeFinancialMessage('uber 23 pix')).toBe(true);
    expect(looksLikeFinancialMessage('fiz um pix de 50 no mercado')).toBe(true);
    expect(looksLikeFinancialMessage('mercado 84,90')).toBe(true);
  });

  it('recusa mensagem sem número', () => {
    expect(looksLikeFinancialMessage('gasto no mercado')).toBe(false);
    expect(looksLikeFinancialMessage('')).toBe(false);
    expect(looksLikeFinancialMessage(null)).toBe(false);
  });

  it('recusa conversa comum com número', () => {
    expect(looksLikeFinancialMessage('chego às 8')).toBe(false);
    expect(looksLikeFinancialMessage('to indo, 10 minutos')).toBe(false);
    expect(looksLikeFinancialMessage('https://exemplo.com/post/123')).toBe(false);
  });

  // A versão com includes() casava a pista dentro de outra palavra:
  // "oi" em "foi"/"noite"/"dois", "net" em "carnet", "conta" em "descontar",
  // "real" em "realmente". Isso disparava a IA (custo) em conversa comum.
  it('não casa pista financeira dentro de outra palavra', () => {
    expect(looksLikeFinancialMessage('foi tudo bem lá hoje, 2 horas')).toBe(false);
    expect(looksLikeFinancialMessage('boa noite, chego 22h')).toBe(false);
    expect(looksLikeFinancialMessage('realmente foram 3 dias')).toBe(false);
    expect(looksLikeFinancialMessage('somos dois, chego 9h')).toBe(false);
  });

  it('ainda casa a palavra inteira legítima', () => {
    expect(looksLikeFinancialMessage('paguei 50 reais')).toBe(true);
    expect(looksLikeFinancialMessage('conta de luz 245,30')).toBe(true);
    expect(looksLikeFinancialMessage('internet 109,90')).toBe(true);
    expect(looksLikeFinancialMessage('30 pila no lanche')).toBe(true);
  });
});
