import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarAcoesFinanceiras, CAMPOS_ALTERAVEIS } from './acoesFinanceirasService.js';

/**
 * Tudo injetado: o serviço nunca importa Firestore nem lancamentoPorMensagem
 * (que arrastaria firebaseAdmin e dispararia a trava anti-produção, regra 2).
 */

const FAMILIA = 'fam-1';
const KIRK = '5564999990001';

let relogio;
let banco;
let pendencias;

const dados = { householdId: FAMILIA };

const transactionService = {
  listTransactions: async () => banco.transacoes,
  updateTransaction: vi.fn(async (_d, id, alteracao) => { banco.alteracoes.push({ id, alteracao }); }),
  deleteTransaction: vi.fn(async (_d, id) => { banco.apagados.push(id); }),
};

const categoryService = {
  listCategories: async () => banco.categorias,
};

const subcategoryService = {
  listSubcategories: async (_d, categoryId) =>
    banco.subcategorias.filter((s) => !categoryId || s.categoryId === categoryId),
};

const sessoes = {
  definirAcaoPendente: async (_d, quem, acao) => { pendencias[quem] = acao; },
  lerAcaoPendente: async (_d, quem) => pendencias[quem] || null,
  limparAcaoPendente: async (_d, quem) => { delete pendencias[quem]; },
};

const lancarPorTexto = vi.fn(async ({ texto }) => ({
  criadas: [{ description: texto, amount: 84, type: 'EXPENSE', category: { name: 'Combustível' } }],
  erro: null,
}));

const acoes = () => criarAcoesFinanceiras({
  transactionService, categoryService, subcategoryService, lancarPorTexto, sessoes,
  agora: () => relogio,
});

beforeEach(() => {
  vi.clearAllMocks();
  relogio = new Date('2026-08-18T12:00:00Z');
  pendencias = {};
  banco = {
    alteracoes: [],
    apagados: [],
    categorias: [
      { id: 'cat-mercado', name: 'Mercado' },
      { id: 'cat-lazer', name: 'Lazer' },
    ],
    subcategorias: [
      { id: 'sub-padaria', name: 'Padaria', categoryId: 'cat-mercado' },
    ],
    transacoes: [
      { id: 't1', description: 'compra do mês', amount: 480, categoryId: 'cat-mercado', category: { name: 'Mercado' }, subcategory: null, date: new Date('2026-08-15') },
      { id: 't2', description: 'pão e leite', amount: 40, categoryId: 'cat-mercado', category: { name: 'Mercado' }, subcategory: { name: 'Padaria' }, date: new Date('2026-08-10') },
      { id: 't3', description: 'ingresso do jogo', amount: 120, categoryId: 'cat-lazer', category: { name: 'Lazer' }, subcategory: null, date: new Date('2026-08-08') },
    ],
  };
});

describe('registrarLancamento — delega, não grava por conta própria', () => {
  it('entrega o texto ao fluxo de lançamento que já existe', async () => {
    const r = await acoes().registrarLancamento(dados, { texto: 'gastei 84 de gasolina' });

    expect(lancarPorTexto).toHaveBeenCalledTimes(1);
    expect(lancarPorTexto.mock.calls[0][0]).toMatchObject({
      householdId: FAMILIA,
      texto: 'gastei 84 de gasolina',
    });
    expect(r.registrados[0].valor).toBe(84);
  });

  it('não inventa caminho próprio de gravação', async () => {
    await acoes().registrarLancamento(dados, { texto: 'gastei 10 no pão' });

    // Nenhuma escrita direta: quem grava é o fluxo delegado.
    expect(banco.alteracoes).toEqual([]);
    expect(banco.apagados).toEqual([]);
  });

  it('recusa texto vazio', async () => {
    const r = await acoes().registrarLancamento(dados, { texto: '  ' });
    expect(r.erro).toBeTruthy();
    expect(lancarPorTexto).not.toHaveBeenCalled();
  });

  it('repassa o erro do fluxo de lançamento sem mascarar', async () => {
    lancarPorTexto.mockResolvedValueOnce({ criadas: [], erro: 'Assinatura vencida.' });
    const r = await acoes().registrarLancamento(dados, { texto: 'gastei 50' });
    expect(r.erro).toBe('Assinatura vencida.');
  });
});

describe('alterar é em duas etapas', () => {
  it('preparar NÃO altera nada', async () => {
    const r = await acoes().prepararAlteracao(dados, { campo: 'categoria', novoValor: 'Lazer' }, { interlocutor: KIRK });

    expect(r.precisaConfirmar).toBe(true);
    expect(banco.alteracoes).toEqual([]);
    expect(transactionService.updateTransaction).not.toHaveBeenCalled();
  });

  it('descreve exatamente o que mudaria', async () => {
    const r = await acoes().prepararAlteracao(dados, { campo: 'categoria', novoValor: 'Lazer' }, { interlocutor: KIRK });

    expect(r.oQueVaiMudar).toMatchObject({ campo: 'categoria', de: 'Mercado', para: 'Lazer' });
    expect(r.oQueVaiMudar.lancamento).toContain('compra do mês');
  });

  it('confirmar executa o que foi proposto', async () => {
    await acoes().prepararAlteracao(dados, { campo: 'categoria', novoValor: 'Lazer' }, { interlocutor: KIRK });
    const r = await acoes().confirmarAcaoPendente(dados, {}, { interlocutor: KIRK });

    expect(r.feito).toBe('ALTERADO');
    expect(banco.alteracoes).toHaveLength(1);
    expect(banco.alteracoes[0].id).toBe('t1');
    expect(banco.alteracoes[0].alteracao.categoryId).toBe('cat-lazer');
  });

  // A trava central: sem proposta gravada no servidor, a confirmação não tem o
  // que executar — nem se o modelo decidir chamar a ferramenta sozinho.
  it('confirmar SEM ter proposto antes não altera nada', async () => {
    const r = await acoes().confirmarAcaoPendente(dados, {}, { interlocutor: KIRK });

    expect(r.erro).toBeTruthy();
    expect(banco.alteracoes).toEqual([]);
    expect(transactionService.updateTransaction).not.toHaveBeenCalled();
  });

  it('a proposta é de uso único: confirmar duas vezes altera uma vez só', async () => {
    await acoes().prepararAlteracao(dados, { campo: 'categoria', novoValor: 'Lazer' }, { interlocutor: KIRK });
    await acoes().confirmarAcaoPendente(dados, {}, { interlocutor: KIRK });
    const segunda = await acoes().confirmarAcaoPendente(dados, {}, { interlocutor: KIRK });

    expect(segunda.erro).toBeTruthy();
    expect(banco.alteracoes).toHaveLength(1);
  });

  it('proposta velha expira em vez de executar', async () => {
    await acoes().prepararAlteracao(dados, { campo: 'categoria', novoValor: 'Lazer' }, { interlocutor: KIRK });

    relogio = new Date('2026-08-18T12:30:00Z'); // 30 min depois
    const r = await acoes().confirmarAcaoPendente(dados, {}, { interlocutor: KIRK });

    expect(r.erro).toMatch(/expirou/i);
    expect(banco.alteracoes).toEqual([]);
  });

  it('cancelar descarta a proposta sem executar', async () => {
    await acoes().prepararAlteracao(dados, { campo: 'categoria', novoValor: 'Lazer' }, { interlocutor: KIRK });
    const r = await acoes().cancelarAcaoPendente(dados, {}, { interlocutor: KIRK });

    expect(r.cancelado).toBe(true);
    expect(banco.alteracoes).toEqual([]);

    // E depois de cancelar, confirmar não ressuscita a proposta.
    const depois = await acoes().confirmarAcaoPendente(dados, {}, { interlocutor: KIRK });
    expect(depois.erro).toBeTruthy();
  });

  it('a proposta de uma pessoa não pode ser confirmada por outra', async () => {
    await acoes().prepararAlteracao(dados, { campo: 'categoria', novoValor: 'Lazer' }, { interlocutor: KIRK });
    const r = await acoes().confirmarAcaoPendente(dados, {}, { interlocutor: '5564999990002' });

    expect(r.erro).toBeTruthy();
    expect(banco.alteracoes).toEqual([]);
  });
});

describe('apagar é em duas etapas', () => {
  it('preparar não apaga', async () => {
    const r = await acoes().prepararExclusao(dados, {}, { interlocutor: KIRK });

    expect(r.precisaConfirmar).toBe(true);
    expect(banco.apagados).toEqual([]);
  });

  it('mostra o que sumiria antes de sumir', async () => {
    const r = await acoes().prepararExclusao(dados, { lancamento: 'ingresso' }, { interlocutor: KIRK });
    expect(r.oQueVaiSerApagado.lancamento).toContain('ingresso do jogo');
  });

  it('confirmar apaga o proposto', async () => {
    await acoes().prepararExclusao(dados, { lancamento: 'ingresso' }, { interlocutor: KIRK });
    const r = await acoes().confirmarAcaoPendente(dados, {}, { interlocutor: KIRK });

    expect(r.feito).toBe('APAGADO');
    expect(banco.apagados).toEqual(['t3']);
  });
});

describe('localizar o lançamento certo', () => {
  it('sem referência, usa o mais recente', async () => {
    const r = await acoes().localizar(dados);
    expect(r.alvo.id).toBe('t1');
  });

  it('casa por trecho da descrição, sem acento nem maiúscula', async () => {
    const r = await acoes().localizar(dados, 'PÃO');
    expect(r.alvo.id).toBe('t2');
  });

  // Escolher sozinha aqui altera o lançamento errado. Melhor perguntar.
  it('mais de um candidato devolve a lista, sem escolher', async () => {
    banco.transacoes.push({
      id: 't4', description: 'pão de queijo', amount: 15, categoryId: 'cat-mercado',
      category: { name: 'Mercado' }, date: new Date('2026-08-09'),
    });

    const r = await acoes().localizar(dados, 'pão');
    expect(r.alvo).toBeUndefined();
    expect(r.ambiguo).toHaveLength(2);
  });

  it('referência que não existe avisa em vez de pegar outro', async () => {
    const r = await acoes().localizar(dados, 'churrascaria');
    expect(r.erro).toMatch(/não encontrei/i);
    expect(r.alvo).toBeUndefined();
  });

  it('ambiguidade não deixa proposta gravada', async () => {
    banco.transacoes.push({
      id: 't4', description: 'pão de queijo', amount: 15, categoryId: 'cat-mercado',
      category: { name: 'Mercado' }, date: new Date('2026-08-09'),
    });

    const r = await acoes().prepararExclusao(dados, { lancamento: 'pão' }, { interlocutor: KIRK });
    expect(r.precisaEscolher).toHaveLength(2);
    expect(pendencias[KIRK]).toBeUndefined();
  });
});

describe('validação dos campos', () => {
  it('recusa campo que não existe', async () => {
    const r = await acoes().prepararAlteracao(dados, { campo: 'householdId', novoValor: 'fam-2' }, { interlocutor: KIRK });
    expect(r.erro).toBeTruthy();
    expect(pendencias[KIRK]).toBeUndefined();
  });

  it('só aceita os campos declarados', () => {
    expect(CAMPOS_ALTERAVEIS).toEqual(['categoria', 'subcategoria', 'valor', 'descricao']);
  });

  it('recusa categoria que a família não tem', async () => {
    const r = await acoes().prepararAlteracao(dados, { campo: 'categoria', novoValor: 'Criptomoedas' }, { interlocutor: KIRK });
    expect(r.erro).toMatch(/não existe a categoria/i);
  });

  it('trocar de categoria limpa a subcategoria antiga', async () => {
    // t2 está em Mercado > Padaria; indo para Lazer, Padaria não faz sentido.
    await acoes().prepararAlteracao(dados, { lancamento: 'pão e leite', campo: 'categoria', novoValor: 'Lazer' }, { interlocutor: KIRK });
    await acoes().confirmarAcaoPendente(dados, {}, { interlocutor: KIRK });

    expect(banco.alteracoes[0].alteracao.subcategoryId).toBeNull();
  });

  it('recusa subcategoria que não pertence à categoria do lançamento', async () => {
    const r = await acoes().prepararAlteracao(dados, { lancamento: 'ingresso', campo: 'subcategoria', novoValor: 'Padaria' }, { interlocutor: KIRK });
    expect(r.erro).toBeTruthy();
  });

  it('entende valor em formato brasileiro', async () => {
    await acoes().prepararAlteracao(dados, { campo: 'valor', novoValor: '1.234,56' }, { interlocutor: KIRK });
    await acoes().confirmarAcaoPendente(dados, {}, { interlocutor: KIRK });

    expect(banco.alteracoes[0].alteracao.amount).toBe(1234.56);
  });

  it('recusa valor inválido', async () => {
    const r = await acoes().prepararAlteracao(dados, { campo: 'valor', novoValor: 'abc' }, { interlocutor: KIRK });
    expect(r.erro).toBe('Valor inválido.');
  });

  it('recusa valor negativo', async () => {
    const r = await acoes().prepararAlteracao(dados, { campo: 'valor', novoValor: '-50' }, { interlocutor: KIRK });
    expect(r.erro).toBe('Valor inválido.');
  });
});
