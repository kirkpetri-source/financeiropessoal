import { describe, it, expect, beforeEach } from 'vitest';
import { criarEscopo } from '../data/escopo.js';
import { criarServicoDeTransacoes } from './transactionService.js';
import { criarConsultaFinanceira, deslocarMes } from './consultaFinanceiraService.js';

/**
 * Dublê de banco em memória, mesmo padrão de budgetService.test.mjs: o serviço
 * recebe o escopo real (`criarEscopo`), então o filtro de tenant é exercitado
 * de verdade — não é um mock que finge isolar.
 */

const estado = { documentos: {} };

function fakeQuery(colecao, filtros = []) {
  return {
    where(campo, op, valor) { return fakeQuery(colecao, [...filtros, { campo, op, valor }]); },
    orderBy() { return fakeQuery(colecao, filtros); },
    limit() { return fakeQuery(colecao, filtros); },
    async get() {
      const docs = Object.entries(estado.documentos)
        .filter(([chave]) => chave.startsWith(`${colecao}/`))
        .map(([chave, dados]) => ({ id: chave.slice(colecao.length + 1), data: () => dados }))
        .filter((doc) => filtros.every((f) => doc.data()[f.campo] === f.valor));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  };
}

const fakeDb = {
  collection(nome) {
    const q = fakeQuery(nome);
    return {
      ...q,
      doc(id) {
        return {
          id,
          async get() {
            const dados = estado.documentos[`${nome}/${id}`];
            return { exists: !!dados, id, data: () => dados };
          },
        };
      },
    };
  },
  async getAll(...refs) { return Promise.all(refs.map((r) => r.get())); },
};

const fakeAdmin = {
  firestore: {
    FieldValue: { serverTimestamp: () => '<agora>' },
    Timestamp: { fromDate: (d) => d },
  },
};

const escopoDe = criarEscopo(fakeDb, fakeAdmin);
const transactionService = criarServicoDeTransacoes({ db: fakeDb, admin: fakeAdmin });

const categoryService = {
  async listCategories(dados) {
    const snap = await dados.consultar('categories').get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
};
const subcategoryService = {
  async listSubcategories(dados, categoryId) {
    let q = dados.consultar('subcategories');
    if (categoryId) q = q.where('categoryId', '==', categoryId);
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
};
const budgetService = { async listBudgets() { return []; } };
const recurringBillService = { async listRecurringBills() { return []; } };

const consulta = criarConsultaFinanceira({
  transactionService, categoryService, subcategoryService, budgetService, recurringBillService,
});

const FAMILIA = 'fam-1';
const OUTRA = 'fam-2';
const MES = '2026-07';

function lancamento(id, dono, { desc, valor, cat, sub, pagador = null, tipo = 'EXPENSE' }) {
  estado.documentos[`transactions/${id}`] = {
    householdId: dono,
    type: tipo,
    description: desc,
    amount: valor,
    categoryId: cat,
    subcategoryId: sub || null,
    paymentMethodId: 'pm-pix',
    date: new Date(`${MES}-10T12:00:00Z`),
    referenceMonth: MES,
    status: 'CONFIRMED',
    paidBy: pagador,
  };
}

beforeEach(() => {
  estado.documentos = {
    'categories/cat-lazer': { householdId: FAMILIA, name: 'Lazer', type: 'EXPENSE' },
    'categories/cat-educacao': { householdId: FAMILIA, name: 'Educação', type: 'EXPENSE' },
    'categories/cat-mercado': { householdId: FAMILIA, name: 'Mercado', type: 'EXPENSE' },
    'categories/cat-da-outra': { householdId: OUTRA, name: 'Categoria alheia', type: 'EXPENSE' },

    // "Futebol" existe em DUAS categorias: o passeio de domingo e a escolinha
    // do filho. É o caso ambíguo real que a consulta precisa saber tratar.
    'subcategories/sub-futebol-lazer': { householdId: FAMILIA, name: 'Futebol', categoryId: 'cat-lazer' },
    'subcategories/sub-futebol-escola': { householdId: FAMILIA, name: 'Futebol', categoryId: 'cat-educacao' },
    'subcategories/sub-padaria': { householdId: FAMILIA, name: 'Padaria', categoryId: 'cat-mercado' },

    'paymentMethods/pm-pix': { householdId: FAMILIA, name: 'Pix' },
  };

  lancamento('t1', FAMILIA, { desc: 'ingresso do jogo', valor: 120, cat: 'cat-lazer', sub: 'sub-futebol-lazer', pagador: 'Kirk' });
  lancamento('t2', FAMILIA, { desc: 'churrasco no estádio', valor: 60, cat: 'cat-lazer', sub: 'sub-futebol-lazer', pagador: 'Kirk' });
  lancamento('t3', FAMILIA, { desc: 'escolinha do joão', valor: 300, cat: 'cat-educacao', sub: 'sub-futebol-escola', pagador: 'Raquel' });
  lancamento('t4', FAMILIA, { desc: 'pão e leite', valor: 40, cat: 'cat-mercado', sub: 'sub-padaria', pagador: 'Raquel' });
  lancamento('t5', FAMILIA, { desc: 'compra do mês', valor: 480, cat: 'cat-mercado', pagador: 'Kirk' });

  // Lançamento de OUTRA família, no mesmo mês. Nunca pode aparecer.
  lancamento('t9', OUTRA, { desc: 'gasto da outra familia', valor: 9999, cat: 'cat-da-outra' });
});

describe('isolamento — a defesa que sustenta a feature', () => {
  it('NENHUMA ferramenta aceita householdId como parâmetro', async () => {
    const dados = escopoDe(FAMILIA);

    // Passar householdId de outra família junto dos argumentos não pode ter
    // efeito nenhum: o inquilino vem do escopo, não do que a IA preencheu.
    const comTentativa = await consulta.resumoDoMes(dados, { mes: MES, householdId: OUTRA });
    const normal = await consulta.resumoDoMes(dados, { mes: MES });

    expect(comTentativa).toEqual(normal);
    expect(comTentativa.gastos).toBe(1000); // 120+60+300+40+480, sem os 9999
  });

  it('não enxerga lançamento de outra família em nenhuma consulta', async () => {
    const dados = escopoDe(FAMILIA);

    const lista = await consulta.listarLancamentos(dados, { mes: MES, limite: 50 });
    const descricoes = lista.lancamentos.map((l) => l.descricao);

    expect(descricoes).not.toContain('gasto da outra familia');
    expect(lista.quantidadeTotal).toBe(5);
  });

  it('a outra família enxerga só o que é dela', async () => {
    const resumo = await consulta.resumoDoMes(escopoDe(OUTRA), { mes: MES });
    expect(resumo.gastos).toBe(9999);
  });
});

describe('gastoPorSubcategoria — consultável sem a categoria-mãe', () => {
  // O requisito: a pessoa pensa "futebol", não "Lazer > Futebol".
  it('encontra a subcategoria sem a pessoa dizer a categoria', async () => {
    const r = await consulta.gastoPorSubcategoria(escopoDe(FAMILIA), { mes: MES, subcategoria: 'Padaria' });

    expect(r.total).toBe(40);
    expect(r.encontrados).toHaveLength(1);
    expect(r.encontrados[0].categoria).toBe('Mercado');
  });

  it('casa sem depender de acento ou maiúscula', async () => {
    const r = await consulta.gastoPorSubcategoria(escopoDe(FAMILIA), { mes: MES, subcategoria: 'padaria' });
    expect(r.total).toBe(40);
  });

  // Nome repetido em categorias diferentes é caso real: Lazer > Futebol (o
  // passeio) e Educação > Futebol (a escolinha). Somar em silêncio esconderia
  // que são coisas diferentes; escolher uma seria chute.
  it('nome repetido em duas categorias devolve AS DUAS, discriminadas', async () => {
    const r = await consulta.gastoPorSubcategoria(escopoDe(FAMILIA), { mes: MES, subcategoria: 'Futebol' });

    expect(r.homonimaEmVariasCategorias).toBe(true);
    expect(r.encontrados).toHaveLength(2);

    const porCategoria = Object.fromEntries(r.encontrados.map((e) => [e.categoria, e.total]));
    expect(porCategoria).toEqual({ 'Educação': 300, 'Lazer': 180 });
  });

  it('subcategoria inexistente devolve vazio, sem inventar', async () => {
    const r = await consulta.gastoPorSubcategoria(escopoDe(FAMILIA), { mes: MES, subcategoria: 'Boliche' });
    expect(r.encontrados).toHaveLength(0);
    expect(r.total).toBe(0);
  });
});

describe('vocabulário da família', () => {
  it('monta a árvore de categorias com suas subcategorias', async () => {
    const vocab = await consulta.montarVocabulario(escopoDe(FAMILIA));

    const lazer = vocab.find((v) => v.categoria === 'Lazer');
    const mercado = vocab.find((v) => v.categoria === 'Mercado');

    expect(lazer.subcategorias).toEqual(['Futebol']);
    expect(mercado.subcategorias).toEqual(['Padaria']);
  });

  it('não vaza categoria de outra família', async () => {
    const vocab = await consulta.montarVocabulario(escopoDe(FAMILIA));
    expect(vocab.map((v) => v.categoria)).not.toContain('Categoria alheia');
  });

  it('família sem subcategoria nenhuma não quebra', async () => {
    delete estado.documentos['subcategories/sub-futebol-lazer'];
    delete estado.documentos['subcategories/sub-futebol-escola'];
    delete estado.documentos['subcategories/sub-padaria'];

    const vocab = await consulta.montarVocabulario(escopoDe(FAMILIA));
    expect(vocab.every((v) => v.subcategorias.length === 0)).toBe(true);
  });

  // Bug real, achado só ao rodar contra dados de verdade: `listCategories`
  // junta as categorias PADRÃO do sistema com as da família. Uma família que
  // cria a própria "Lazer" (nome que já existe no padrão) aparecia duas vezes
  // no vocabulário — uma vazia, outra com as subcategorias. A IA que lesse a
  // entrada errada concluiria que Lazer não tem subcategoria, e "quanto gastei
  // em futebol" deixaria de funcionar.
  describe('categoria da família com o mesmo nome de uma padrão', () => {
    beforeEach(() => {
      // Simula a categoria PADRÃO "Lazer" do sistema convivendo com a da família.
      estado.documentos['categories/cat-lazer-padrao'] = {
        householdId: FAMILIA, name: 'Lazer', type: 'EXPENSE', isDefault: true,
      };
    });

    it('aparece uma única vez no vocabulário', async () => {
      const vocab = await consulta.montarVocabulario(escopoDe(FAMILIA));
      const entradas = vocab.filter((v) => v.categoria === 'Lazer');

      expect(entradas).toHaveLength(1);
    });

    it('mantém as subcategorias, sem esvaziar', async () => {
      const vocab = await consulta.montarVocabulario(escopoDe(FAMILIA));
      const lazer = vocab.find((v) => v.categoria === 'Lazer');

      expect(lazer.subcategorias).toContain('Futebol');
    });

    it('não duplica subcategoria quando as duas categorias têm a mesma', async () => {
      estado.documentos['subcategories/sub-futebol-padrao'] = {
        householdId: FAMILIA, name: 'Futebol', categoryId: 'cat-lazer-padrao',
      };

      const vocab = await consulta.montarVocabulario(escopoDe(FAMILIA));
      const lazer = vocab.find((v) => v.categoria === 'Lazer');

      expect(lazer.subcategorias.filter((s) => s === 'Futebol')).toHaveLength(1);
    });
  });
});

describe('gastoPorCategoria', () => {
  it('traz total, fatia do mês e a quebra por subcategoria', async () => {
    const r = await consulta.gastoPorCategoria(escopoDe(FAMILIA), { mes: MES });

    const mercado = r.categorias.find((c) => c.categoria === 'Mercado');
    expect(mercado.total).toBe(520);
    expect(mercado.fatiaDoMes).toBe(52); // 520 de 1000
    expect(mercado.subcategorias).toEqual([{ subcategoria: 'Padaria', total: 40 }]);
  });

  it('filtra por uma categoria quando pedido', async () => {
    const r = await consulta.gastoPorCategoria(escopoDe(FAMILIA), { mes: MES, categoria: 'lazer' });
    expect(r.categorias).toHaveLength(1);
    expect(r.categorias[0].total).toBe(180);
  });
});

describe('resumoDoMes', () => {
  it('separa gasto por pessoa', async () => {
    const r = await consulta.resumoDoMes(escopoDe(FAMILIA), { mes: MES });
    const porPessoa = Object.fromEntries(r.porPessoa.map((p) => [p.pessoa, p.gastos]));

    expect(porPessoa.Kirk).toBe(660);   // 120+60+480
    expect(porPessoa.Raquel).toBe(340); // 300+40
  });
});

describe('listarLancamentos', () => {
  it('respeita o teto de itens', async () => {
    const r = await consulta.listarLancamentos(escopoDe(FAMILIA), { mes: MES, limite: 2 });
    expect(r.lancamentos).toHaveLength(2);
    expect(r.quantidadeTotal).toBe(5);
  });

  it('filtra por subcategoria', async () => {
    const r = await consulta.listarLancamentos(escopoDe(FAMILIA), { mes: MES, subcategoria: 'Padaria' });
    expect(r.lancamentos).toHaveLength(1);
    expect(r.lancamentos[0].descricao).toBe('pão e leite');
  });
});

describe('deslocarMes', () => {
  it('anda para trás atravessando o ano', () => {
    expect(deslocarMes('2026-01', -1)).toBe('2025-12');
  });

  it('anda para frente atravessando o ano', () => {
    expect(deslocarMes('2026-12', 1)).toBe('2027-01');
  });

  it('volta três meses', () => {
    expect(deslocarMes('2026-08', -3)).toBe('2026-05');
  });
});

describe('retratoFinanceiro', () => {
  it('limita a janela a 6 meses, mesmo se pedirem mais', async () => {
    const r = await consulta.retratoFinanceiro(escopoDe(FAMILIA), { meses: 60 });
    expect(r.meses).toHaveLength(6);
  });

  it('nunca desce abaixo de 2 meses (comparar exige dois pontos)', async () => {
    const r = await consulta.retratoFinanceiro(escopoDe(FAMILIA), { meses: 1 });
    expect(r.meses).toHaveLength(2);
  });
});
