import { describe, it, expect, vi } from 'vitest';
import { criarServicoDeImportacao, idDoLancamento } from './importacaoService.js';

/**
 * Escopo de dados dublado por injeção (regra 2 do projeto: nada de mock de
 * módulo perto do Firestore).
 *
 * O dublê reproduz de propósito o comportamento que dá a garantia principal:
 * `criarComId` NÃO sobrescreve documento existente, do mesmo jeito que o
 * `create()` do Firestore. É essa recusa que impede lançamento duplicado — se
 * o dublê deixasse sobrescrever, o teste passaria e a produção duplicaria.
 *
 * O que estes testes protegem:
 *   1. mês corrente nunca entra, nem por rascunho velho atravessando a virada;
 *   2. a mesma linha do extrato não grava duas vezes, em nenhuma ordem de
 *      eventos (reimportação, duplo clique, arquivos com período sobreposto);
 *   3. lançamento que já existe (WhatsApp) vira aviso, não descarte automático;
 *   4. desfazer apaga só o que a importação criou;
 *   5. nada disso encosta em lançamento de outra origem.
 */

const AGORA = new Date('2026-08-16T15:00:00Z'); // agosto/2026 correndo → julho é o último mês fechado

const OFX_JULHO = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260705<TRNAMT>-84.90<FITID>AAA111<MEMO>COMPRA NO DEBITO - SUPERMERCADO BOM PRECO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260712<TRNAMT>-150.00<FITID>AAA222<MEMO>POSTO IPIRANGA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260715<TRNAMT>3200.00<FITID>AAA333<MEMO>SALARIO EMPRESA LTDA</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const OFX_COM_MES_CORRENTE = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260705<TRNAMT>-84.90<FITID>BBB111<MEMO>SUPERMERCADO BOM PRECO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260812<TRNAMT>-99.00<FITID>BBB222<MEMO>FARMACIA SAO JOAO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

function criarBanco({ transacoesExistentes = [], categorias = null } = {}) {
  let seq = 0;
  const colecoes = {
    transactions: new Map(),
    importBatches: new Map(),
    importMemoria: new Map(),
    categories: new Map(),
  };

  const categoriasPadrao = categorias || [
    { id: 'cat-mercado', name: 'Mercado', type: 'EXPENSE', isDefault: true },
    { id: 'cat-combustivel', name: 'Combustível', type: 'EXPENSE', isDefault: true },
    { id: 'cat-outros-d', name: 'Outros', type: 'EXPENSE', isDefault: true },
    { id: 'cat-salario', name: 'Salário', type: 'INCOME', isDefault: true },
    { id: 'cat-outros-r', name: 'Outros', type: 'INCOME', isDefault: true },
  ];
  for (const c of categoriasPadrao) colecoes.categories.set(c.id, c);

  for (const t of transacoesExistentes) {
    const id = t.id || `existente-${++seq}`;
    colecoes.transactions.set(id, { householdId: 'fam-1', ...t });
  }

  const admin = {
    firestore: {
      FieldValue: { serverTimestamp: () => ({ toDate: () => new Date('2026-08-16T15:00:00Z') }) },
      Timestamp: { fromDate: (d) => ({ toDate: () => d, _data: d }) },
    },
  };

  function escopoDe(householdId) {
    const daFamilia = (nome) => [...colecoes[nome].entries()]
      .filter(([, v]) => v.householdId === householdId);

    return {
      householdId,
      consultar(nome) {
        const filtros = [];
        const query = {
          where(campo, _op, valor) { filtros.push([campo, valor]); return query; },
          async get() {
            const docs = daFamilia(nome)
              .filter(([, v]) => filtros.every(([campo, valor]) => v[campo] === valor))
              .map(([id, v]) => ({ id, data: () => v }));
            return { docs };
          },
        };
        return query;
      },
      consultarPadroes(nome) {
        return {
          async get() {
            return {
              docs: [...colecoes[nome].entries()]
                .filter(([, v]) => v.isDefault === true)
                .map(([id, v]) => ({ id, data: () => v })),
            };
          },
        };
      },
      async buscarDoc(nome, id) {
        const v = colecoes[nome].get(id);
        if (!v) return null;
        if (v.isDefault === true) return { id, ...v, _somenteLeitura: true };
        if (v.householdId !== householdId) return null;
        return { id, ...v };
      },
      async criar(nome, valores) {
        const id = `${nome}-${++seq}`;
        colecoes[nome].set(id, { ...valores, householdId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        return { id, ...colecoes[nome].get(id) };
      },
      // O ponto do teste: espelha `create()` do Firestore — não sobrescreve.
      async criarComId(nome, id, valores) {
        if (colecoes[nome].has(id)) return { id, criado: false, motivo: 'JA_EXISTE' };
        colecoes[nome].set(id, { ...valores, householdId });
        return { id, criado: true };
      },
      async atualizar(nome, id, valores) {
        const atual = colecoes[nome].get(id);
        if (!atual || atual.householdId !== householdId) {
          throw Object.assign(new Error('Registro não encontrado.'), { statusCode: 404 });
        }
        colecoes[nome].set(id, { ...atual, ...valores });
        return { id, ...colecoes[nome].get(id) };
      },
      async remover(nome, id) {
        const atual = colecoes[nome].get(id);
        if (!atual || atual.householdId !== householdId) {
          throw Object.assign(new Error('Registro não encontrado.'), { statusCode: 404 });
        }
        colecoes[nome].delete(id);
      },
      docDaFamilia(nome) {
        return {
          async get() {
            const v = colecoes[nome].get(householdId);
            return { exists: !!v, data: () => v };
          },
          async set(valores) {
            colecoes[nome].set(householdId, { ...(colecoes[nome].get(householdId) || {}), ...valores });
          },
        };
      },
    };
  }

  return { escopoDe, admin, colecoes };
}

function criarServico(opcoes = {}) {
  const banco = criarBanco(opcoes);
  const servico = criarServicoDeImportacao({
    escopoDe: banco.escopoDe,
    admin: banco.admin,
    categorizarComIA: opcoes.categorizarComIA ?? null,
    consumirCreditoDeIA: opcoes.consumirCreditoDeIA ?? null,
  });
  return { servico, ...banco };
}

/** Confirma tudo que o preview trouxe, como quem aceita as sugestões da tela. */
function todosOsIndices(preview) {
  return preview.linhas.map((_, indice) => ({ indice }));
}

describe('janela retroativa', () => {
  it('não oferece o mês corrente nem quando ele está no arquivo', async () => {
    const { servico } = criarServico();

    const preview = await servico.analisar({
      householdId: 'fam-1',
      conteudo: OFX_COM_MES_CORRENTE,
      agora: AGORA,
    });

    expect(preview.linhas).toHaveLength(1);
    expect(preview.linhas[0].data).toBe('2026-07-05');
    expect(preview.recusadas.total).toBe(1);
    expect(preview.recusadas.porMotivo.MES_CORRENTE).toBe(1);
    expect(preview.limiteRetroativo).toBe('2026-07');
  });

  it('extrato só do mês corrente é recusado por inteiro, com explicação', async () => {
    const { servico } = criarServico();

    await expect(servico.analisar({
      householdId: 'fam-1',
      conteudo: `OFXHEADER:100
<OFX><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260810<TRNAMT>-50.00<FITID>C1<MEMO>PADARIA</STMTTRN>
</BANKTRANLIST></OFX>`,
      agora: AGORA,
    })).rejects.toMatchObject({ statusCode: 422, codigo: 'MES_CORRENTE' });
  });

  it('rascunho que atravessa a virada do mês não grava o mês que virou corrente', async () => {
    const { servico, colecoes } = criarServico();

    // Analisado em setembro (agosto já fechado), confirmado só em outubro? Não:
    // o caso real é o inverso — analisado quando agosto ainda era fechado e
    // confirmado depois. Aqui o rascunho nasce em setembro e a confirmação
    // acontece com o relógio de volta a agosto, que é o que a segunda barreira
    // precisa barrar.
    const preview = await servico.analisar({
      householdId: 'fam-1',
      conteudo: OFX_COM_MES_CORRENTE,
      agora: new Date('2026-09-05T12:00:00Z'),
    });
    expect(preview.linhas).toHaveLength(2); // em setembro, agosto é importável

    const r = await servico.confirmar({
      householdId: 'fam-1',
      batchId: preview.id,
      escolhas: todosOsIndices(preview),
      agora: AGORA, // relógio da gravação: agosto ainda corrente
    });

    expect(r.totalCriadas).toBe(1);
    expect(r.puladas).toContainEqual({ indice: 1, motivo: 'MES_CORRENTE' });
    expect(colecoes.transactions.size).toBe(1);
  });
});

describe('trava de duplicidade', () => {
  it('grava o extrato uma vez e ignora a reimportação inteira', async () => {
    const { servico, colecoes } = criarServico();

    const primeira = await servico.analisar({ householdId: 'fam-1', conteudo: OFX_JULHO, agora: AGORA });
    const r1 = await servico.confirmar({
      householdId: 'fam-1', batchId: primeira.id, escolhas: todosOsIndices(primeira), agora: AGORA,
    });
    expect(r1.totalCriadas).toBe(3);

    // Mesmo arquivo, de novo: o preview já marca tudo como importado.
    const segunda = await servico.analisar({ householdId: 'fam-1', conteudo: OFX_JULHO, agora: AGORA });
    expect(segunda.linhas.every((l) => l.jaImportada)).toBe(true);
    expect(segunda.jaImportadas).toBe(3);

    // E mesmo forçando a confirmação de tudo, nada entra.
    const r2 = await servico.confirmar({
      householdId: 'fam-1', batchId: segunda.id, escolhas: todosOsIndices(segunda), agora: AGORA,
    });
    expect(r2.totalCriadas).toBe(0);
    expect(r2.totalPuladas).toBe(3);
    expect(colecoes.transactions.size).toBe(3);
  });

  it('duplo clique em confirmar não duplica (o Firestore recusa o segundo)', async () => {
    const { servico, colecoes } = criarServico();

    const preview = await servico.analisar({ householdId: 'fam-1', conteudo: OFX_JULHO, agora: AGORA });

    await servico.confirmar({
      householdId: 'fam-1', batchId: preview.id, escolhas: todosOsIndices(preview), agora: AGORA,
    });

    // Segunda chamada no mesmo lote é recusada antes mesmo de gravar.
    await expect(servico.confirmar({
      householdId: 'fam-1', batchId: preview.id, escolhas: todosOsIndices(preview), agora: AGORA,
    })).rejects.toMatchObject({ statusCode: 409, codigo: 'JA_CONFIRMADA' });

    expect(colecoes.transactions.size).toBe(3);
  });

  it('arquivos com período sobreposto só trazem o que falta', async () => {
    const { servico, colecoes } = criarServico();

    const julho = await servico.analisar({ householdId: 'fam-1', conteudo: OFX_JULHO, agora: AGORA });
    await servico.confirmar({
      householdId: 'fam-1', batchId: julho.id, escolhas: todosOsIndices(julho), agora: AGORA,
    });

    // "Junho a julho": repete as três de julho e traz uma de junho.
    const juntos = `OFXHEADER:100
<OFX><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260620<TRNAMT>-40.00<FITID>JUN1<MEMO>PADARIA CENTRAL</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260705<TRNAMT>-84.90<FITID>AAA111<MEMO>COMPRA NO DEBITO - SUPERMERCADO BOM PRECO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260712<TRNAMT>-150.00<FITID>AAA222<MEMO>POSTO IPIRANGA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260715<TRNAMT>3200.00<FITID>AAA333<MEMO>SALARIO EMPRESA LTDA</STMTTRN>
</BANKTRANLIST></OFX>`;

    const preview = await servico.analisar({ householdId: 'fam-1', conteudo: juntos, agora: AGORA });
    expect(preview.jaImportadas).toBe(3);

    const r = await servico.confirmar({
      householdId: 'fam-1', batchId: preview.id, escolhas: todosOsIndices(preview), agora: AGORA,
    });

    expect(r.totalCriadas).toBe(1);
    expect(colecoes.transactions.size).toBe(4);
  });

  it('o ID do lançamento é derivado da digital, e a digital não colide entre famílias', () => {
    const a = idDoLancamento('fam-1', 'digital-x');
    const b = idDoLancamento('fam-2', 'digital-x');
    expect(a).not.toBe(b);
  });
});

describe('convivência com o que já existe', () => {
  it('marca provável duplicata do lançamento feito por WhatsApp, sem apagar nem travar', async () => {
    const { servico } = criarServico({
      transacoesExistentes: [{
        // Mesmo valor do supermercado, um dia depois: foi lançado no WhatsApp.
        amount: 84.9,
        type: 'EXPENSE',
        description: 'mercado',
        origin: 'WHATSAPP',
        referenceMonth: '2026-07',
        date: { toDate: () => new Date('2026-07-06T12:00:00Z') },
      }],
    });

    const preview = await servico.analisar({ householdId: 'fam-1', conteudo: OFX_JULHO, agora: AGORA });

    const marcada = preview.linhas.find((l) => l.valor === 84.9);
    expect(marcada.provavelDuplicata).toMatchObject({ origem: 'WHATSAPP', valor: 84.9 });

    // Continua importável — quem decide é o usuário.
    const mes = preview.meses.find((m) => m.mes === '2026-07');
    expect(mes.risco).toBe('com_dados');
    expect(mes.provaveisDuplicatas).toBe(1);
    expect(mes.sugestaoImportar).toBe(2);
  });

  it('desfazer apaga só o que a importação criou', async () => {
    const { servico, colecoes } = criarServico({
      transacoesExistentes: [{
        id: 'do-whatsapp',
        amount: 30,
        type: 'EXPENSE',
        description: 'lanche',
        origin: 'WHATSAPP',
        referenceMonth: '2026-07',
        date: { toDate: () => new Date('2026-07-20T12:00:00Z') },
      }],
    });

    const preview = await servico.analisar({ householdId: 'fam-1', conteudo: OFX_JULHO, agora: AGORA });
    await servico.confirmar({
      householdId: 'fam-1', batchId: preview.id, escolhas: todosOsIndices(preview), agora: AGORA,
    });
    expect(colecoes.transactions.size).toBe(4);

    const r = await servico.desfazer({ householdId: 'fam-1', batchId: preview.id });

    expect(r.apagadas).toBe(3);
    expect(colecoes.transactions.size).toBe(1);
    expect(colecoes.transactions.has('do-whatsapp')).toBe(true);
  });

  it('não dá para desfazer duas vezes', async () => {
    const { servico } = criarServico();

    const preview = await servico.analisar({ householdId: 'fam-1', conteudo: OFX_JULHO, agora: AGORA });
    await servico.confirmar({
      householdId: 'fam-1', batchId: preview.id, escolhas: todosOsIndices(preview), agora: AGORA,
    });
    await servico.desfazer({ householdId: 'fam-1', batchId: preview.id });

    await expect(servico.desfazer({ householdId: 'fam-1', batchId: preview.id }))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('isolamento entre famílias', () => {
  it('lote de outra família não é visível nem confirmável', async () => {
    const { servico } = criarServico();

    const preview = await servico.analisar({ householdId: 'fam-1', conteudo: OFX_JULHO, agora: AGORA });

    await expect(servico.buscarLote({ householdId: 'fam-2', batchId: preview.id }))
      .rejects.toMatchObject({ statusCode: 404 });

    await expect(servico.confirmar({
      householdId: 'fam-2', batchId: preview.id, escolhas: [{ indice: 0 }], agora: AGORA,
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('categorização', () => {
  it('usa a memória da família antes de qualquer palpite, e aprende com a escolha', async () => {
    const { servico, colecoes } = criarServico();

    const preview = await servico.analisar({ householdId: 'fam-1', conteudo: OFX_JULHO, agora: AGORA });
    const salario = preview.linhas.findIndex((l) => l.tipo === 'INCOME');

    await servico.confirmar({
      householdId: 'fam-1',
      batchId: preview.id,
      escolhas: [{ indice: salario, categoria: 'Salário' }],
      agora: AGORA,
    });

    const memoria = colecoes.importMemoria.get('fam-1');
    expect(Object.values(memoria.mapa)).toContain('Salário');
  });

  it('IA fora do ar não impede a importação', async () => {
    const { servico } = criarServico({
      categorizarComIA: vi.fn(async () => { throw new Error('Gemini 429'); }),
      consumirCreditoDeIA: async () => true,
    });

    const preview = await servico.analisar({ householdId: 'fam-1', conteudo: OFX_JULHO, agora: AGORA });
    expect(preview.linhas).toHaveLength(3);
  });

  it('teto diário de IA estourado não impede a importação', async () => {
    const chamouIA = vi.fn(async () => ({}));
    const { servico } = criarServico({
      categorizarComIA: chamouIA,
      consumirCreditoDeIA: async () => false,
    });

    const preview = await servico.analisar({ householdId: 'fam-1', conteudo: OFX_JULHO, agora: AGORA });

    expect(preview.linhas).toHaveLength(3);
    expect(chamouIA).not.toHaveBeenCalled();
  });
});
