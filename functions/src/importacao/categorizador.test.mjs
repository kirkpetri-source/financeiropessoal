import { describe, it, expect, vi } from 'vitest';
import { categorizar, limparDescricao, chaveDeAprendizado, pareceTransferencia, CONFIANCA } from './categorizador.js';

/**
 * O que estes testes protegem, além do óbvio: que a IA seja chamada UMA vez
 * com descrições distintas, e não uma vez por linha. Um extrato de 200 linhas
 * batendo 200 vezes na IA estouraria o teto diário da família (60) e a cota
 * compartilhada do projeto inteiro.
 */

function transacao(descricao, extra = {}) {
  return { data: '2026-08-05', descricao, tipo: 'EXPENSE', valor: 50, digital: descricao, ...extra };
}

describe('limpeza da descrição do banco', () => {
  it('tira o prefixo de maquininha e o número da autorização', () => {
    expect(limparDescricao('PAG*MERCADO BOM PRECO NSU 123456')).toBe('MERCADO BOM PRECO');
  });

  it('tira a data grudada na descrição', () => {
    expect(limparDescricao('POSTO SHELL 05/08/2026')).toBe('POSTO SHELL');
  });

  it('tira o rótulo de Pix e sobra o nome de quem recebeu', () => {
    expect(limparDescricao('PIX ENVIADO JOAO DA SILVA')).toBe('JOAO DA SILVA');
  });

  it('não devolve string vazia quando a descrição é só ruído', () => {
    expect(limparDescricao('PAG*')).toBeTruthy();
  });
});

describe('transferência entre contas próprias', () => {
  it('reconhece aplicação, resgate e rendimento', () => {
    expect(pareceTransferencia('APLICACAO CDB')).toBe(true);
    expect(pareceTransferencia('RESGATE POUPANCA')).toBe(true);
    expect(pareceTransferencia('RENDIMENTO')).toBe(true);
  });

  it('não marca compra comum como transferência', () => {
    expect(pareceTransferencia('SUPERMERCADO BOM PRECO')).toBe(false);
  });
});

describe('camada 1 — regras (sem custo de IA)', () => {
  it('categoriza pelo que a regra reconhece e marca confiança alta', async () => {
    const r = await categorizar([
      transacao('SUPERMERCADO BOM PRECO'),
      transacao('POSTO SHELL COMBUSTIVEL'),
      transacao('DROGARIA SAO PAULO FARMACIA'),
    ]);

    expect(r[0]).toMatchObject({ categoriaSugerida: 'Mercado', confianca: CONFIANCA.REGRA });
    expect(r[1]).toMatchObject({ categoriaSugerida: 'Combustível', confianca: CONFIANCA.REGRA });
    expect(r[2]).toMatchObject({ categoriaSugerida: 'Farmácia', confianca: CONFIANCA.REGRA });
  });

  // "99" seria Transporte (o app de corrida está no CATEGORY_MAP) e
  // "churrascaria" é Alimentação — exemplos aqui precisam ser realmente
  // desconhecidos, senão o teste da camada 2 nunca exercita a IA.
  it('sem IA disponível, o desconhecido vira Outros em vez de travar', async () => {
    const r = await categorizar([transacao('BRASPRESS TRANSPORTES URGENTES')], { resolverComIA: null });
    expect(r[0]).toMatchObject({ categoriaSugerida: 'Outros', confianca: CONFIANCA.PADRAO });
  });
});

describe('camada 2 — IA em lote', () => {
  it('chama a IA UMA vez, com as descrições distintas', async () => {
    const resolverComIA = vi.fn(async () => ({ 'CACAU SHOW': 'Alimentação' }));

    // A mesma descrição repetida 5 vezes tem que virar UMA pergunta.
    const repetida = Array.from({ length: 5 }, () => transacao('CACAU SHOW'));
    const r = await categorizar(repetida, { resolverComIA });

    expect(resolverComIA).toHaveBeenCalledTimes(1);
    expect(resolverComIA).toHaveBeenCalledWith(['CACAU SHOW']);
    expect(r.every((t) => t.categoriaSugerida === 'Alimentação')).toBe(true);
    expect(r.every((t) => t.confianca === CONFIANCA.IA)).toBe(true);
  });

  it('não manda para a IA o que a regra já resolveu', async () => {
    const resolverComIA = vi.fn(async () => ({}));

    await categorizar([
      transacao('SUPERMERCADO BOM PRECO'),
      transacao('LOJA MAGALU'),
    ], { resolverComIA });

    const [enviadas] = resolverComIA.mock.calls[0];
    expect(enviadas).toEqual(['LOJA MAGALU']);
    expect(enviadas).not.toContain('SUPERMERCADO BOM PRECO');
  });

  it('não gasta IA com transferência entre contas próprias', async () => {
    const resolverComIA = vi.fn(async () => ({}));
    await categorizar([transacao('APLICACAO CDB AUTOMATICA')], { resolverComIA });
    expect(resolverComIA).not.toHaveBeenCalled();
  });

  it('não chama a IA quando as regras deram conta de tudo', async () => {
    const resolverComIA = vi.fn(async () => ({}));
    await categorizar([transacao('SUPERMERCADO'), transacao('POSTO GASOLINA')], { resolverComIA });
    expect(resolverComIA).not.toHaveBeenCalled();
  });

  it('IA quebrada não derruba a importação — cai para Outros', async () => {
    const resolverComIA = vi.fn(async () => { throw new Error('429 cota estourada'); });

    const r = await categorizar([transacao("KALUNGA PAPELARIA")], { resolverComIA });

    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ categoriaSugerida: 'Outros', confianca: CONFIANCA.PADRAO });
  });

  it('descrição que a IA não soube responder vira Outros, não fica sem categoria', async () => {
    const resolverComIA = vi.fn(async () => ({ "OUTRA COISA": 'Mercado' }));
    const r = await categorizar([transacao("KALUNGA PAPELARIA")], { resolverComIA });
    expect(r[0].categoriaSugerida).toBe('Outros');
  });
});

/**
 * Esta camada nasceu de um extrato REAL: 87% das linhas eram
 * "Transferência recebida pelo Pix - <nome>", que nenhuma regra e nenhuma IA
 * consegue categorizar — só quem recebeu sabe se aquele Pix é salário,
 * reembolso ou empréstimo devolvido. Memória resolve o que inteligência não
 * resolve.
 */
describe('camada 0 — memória da própria família', () => {
  it('a mesma contraparte de Pix, já classificada antes, não é perguntada de novo', async () => {
    const historico = { 'joao da silva': 'Serviços' };
    const resolverComIA = vi.fn(async () => ({}));

    const r = await categorizar(
      [transacao('Transferência recebida pelo Pix - João da Silva', { tipo: 'INCOME' })],
      { historico, resolverComIA },
    );

    expect(r[0]).toMatchObject({ categoriaSugerida: 'Serviços', confianca: CONFIANCA.HISTORICO });
    expect(resolverComIA).not.toHaveBeenCalled();
  });

  it('memória vence a regra — a escolha da família vale mais que a palavra-chave', async () => {
    const r = await categorizar(
      [transacao('Compra no débito - Supermercado Bom Preco')],
      { historico: { 'supermercado bom preco': 'Educação' } },
    );
    expect(r[0]).toMatchObject({ categoriaSugerida: 'Educação', confianca: CONFIANCA.HISTORICO });
  });

  it('sem memória do nome, segue o fluxo normal', async () => {
    const r = await categorizar(
      [transacao('Transferência recebida pelo Pix - Outra Pessoa', { tipo: 'INCOME' })],
      { historico: { 'joao da silva': 'Serviços' } },
    );
    expect(r[0].confianca).not.toBe(CONFIANCA.HISTORICO);
  });

  it('aceita Map além de objeto', async () => {
    const r = await categorizar(
      [transacao('Transferência recebida pelo Pix - João da Silva', { tipo: 'INCOME' })],
      { historico: new Map([['joao da silva', 'Renda Extra']]) },
    );
    expect(r[0].categoriaSugerida).toBe('Renda Extra');
  });
});

describe('chave de aprendizado', () => {
  it('junta as várias formas de Pix do mesmo nome numa memória só', () => {
    const esperada = 'joao da silva';
    expect(chaveDeAprendizado('Transferência recebida pelo Pix - João da Silva')).toBe(esperada);
    expect(chaveDeAprendizado('Transferência enviada pelo Pix - João da Silva')).toBe(esperada);
    expect(chaveDeAprendizado('Transferência Recebida - João da Silva')).toBe(esperada);
    expect(chaveDeAprendizado('Pix enviado - João da Silva')).toBe(esperada);
  });

  it('separa contrapartes diferentes', () => {
    expect(chaveDeAprendizado('Pix recebido - Maria'))
      .not.toBe(chaveDeAprendizado('Pix recebido - Joana'));
  });

  it('funciona para estabelecimento, não só para pessoa', () => {
    expect(chaveDeAprendizado('Compra no débito - Padaria Central')).toBe('padaria central');
  });
});

describe('entradas (INCOME)', () => {
  it('usa as regras de receita, não as de despesa', async () => {
    const r = await categorizar([
      transacao('SALARIO EMPRESA LTDA', { tipo: 'INCOME' }),
    ]);
    expect(r[0]).toMatchObject({ categoriaSugerida: 'Salário', confianca: CONFIANCA.REGRA });
  });
});
