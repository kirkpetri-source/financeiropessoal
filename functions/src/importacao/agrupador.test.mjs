import { describe, it, expect } from 'vitest';
import { agrupar, aplicarNoGrupo, memoriaAprendida, sugerirLotes, prefixoDaOperacao } from './agrupador.js';
import { categorizar } from './categorizador.js';

/**
 * Estes testes cobrem PERFIS DIFERENTES de extrato de propósito.
 *
 * O primeiro extrato real que validamos era de conta comercial (dezenas de
 * Pix de pessoas distintas) e quase levou o projeto a otimizar só para esse
 * caso. A funcionalidade precisa funcionar para a família que compra sempre
 * nos mesmos lugares, para quem só tem salário e contas fixas, e para quem
 * recebe de muita gente diferente — os três aparecem aqui.
 */

function linha(descricao, valor, tipo = 'EXPENSE') {
  return { data: '2026-07-05', descricao, valor, tipo, digital: `${descricao}-${valor}` };
}

describe('perfil A — família comum (mesmos lugares se repetindo)', () => {
  const extrato = [
    linha('Compra no débito - Supermercado Bom Preco', 150),
    linha('Compra no débito - Supermercado Bom Preco', 89),
    linha('Compra no débito - Supermercado Bom Preco', 210),
    linha('Compra no débito - Posto Shell', 200),
    linha('Compra no débito - Posto Shell', 180),
    linha('Pagamento de boleto efetuado - Energia Eletrica', 320),
  ];

  it('agrupa as compras repetidas, reduzindo muito o trabalho de revisão', async () => {
    const grupos = agrupar(await categorizar(extrato));
    // 6 lançamentos viram 3 decisões.
    expect(grupos).toHaveLength(3);
    expect(grupos.reduce((s, g) => s + g.quantidade, 0)).toBe(6);
  });

  it('soma o total de cada grupo, para a pessoa ver o peso antes de decidir', async () => {
    const grupos = agrupar(await categorizar(extrato));
    const mercado = grupos.find((g) => g.chave.includes('supermercado'));
    expect(mercado.quantidade).toBe(3);
    expect(mercado.total).toBe(449);
  });

  it('neste perfil as regras já resolvem quase tudo sem precisar de IA', async () => {
    const grupos = agrupar(await categorizar(extrato));
    expect(grupos.filter((g) => g.precisaRevisao)).toHaveLength(0);
  });
});

describe('perfil B — conta comercial (muitas contrapartes distintas)', () => {
  const extrato = Array.from({ length: 20 }, (_, i) => linha(`Transferência recebida pelo Pix - Cliente ${i}`, 100 + i, 'INCOME'));

  it('agrupar rende pouco aqui — cada Pix é de uma pessoa diferente', async () => {
    const grupos = agrupar(await categorizar(extrato));
    expect(grupos).toHaveLength(20);
  });

  it('mas classificar um grupo aplica em todas as suas linhas de uma vez', async () => {
    const categorizadas = await categorizar(extrato);
    const grupos = agrupar(categorizadas);

    // O usuário seleciona vários grupos e aplica de uma vez — é o caminho
    // que salva este perfil, já que agrupar sozinho não reduz nada.
    const todosOsIndices = grupos.flatMap((g) => g.indices);
    const depois = aplicarNoGrupo(categorizadas, todosOsIndices, 'Renda Extra');

    expect(depois.every((t) => t.categoriaSugerida === 'Renda Extra')).toBe(true);
    expect(depois.every((t) => t.confianca === 'usuario')).toBe(true);
  });

  it('a escolha vira memória, e no mês seguinte esses clientes não são perguntados de novo', async () => {
    const categorizadas = await categorizar(extrato);
    const grupos = agrupar(categorizadas);
    const depois = aplicarNoGrupo(categorizadas, grupos.flatMap((g) => g.indices), 'Renda Extra');

    const memoria = memoriaAprendida(depois);
    expect(Object.keys(memoria)).toHaveLength(20);

    // Mês 2: os mesmos clientes voltam.
    const mes2 = await categorizar(extrato, { historico: memoria });
    expect(mes2.every((t) => t.confianca === 'historico')).toBe(true);
    expect(agrupar(mes2).filter((g) => g.precisaRevisao)).toHaveLength(0);
  });
});

describe('perfil C — salário e contas fixas (poucos lançamentos, muito recorrentes)', () => {
  const extrato = [
    linha('Transferência recebida pelo Pix - EMPRESA LTDA', 5000, 'INCOME'),
    linha('Pagamento de boleto efetuado - Energia Eletrica', 320),
    linha('Pagamento de boleto efetuado - Internet Fibra', 120),
    linha('Compra no débito - Farmacia Popular', 85),
  ];

  it('regras pegam contas de casa direto', async () => {
    const grupos = agrupar(await categorizar(extrato));
    const energia = grupos.find((g) => g.chave.includes('energia'));
    expect(energia.categoriaSugerida).toBe('Energia');
    expect(energia.confianca).toBe('regra');
  });
});

/**
 * A terceira estratégia, e a que fecha o buraco deixado pelas outras duas:
 * agrupar por TIPO DE OPERAÇÃO em vez de por contraparte. Num extrato onde
 * cada Pix é de uma pessoa diferente, agrupar por contraparte não reduz nada,
 * mas todas as linhas compartilham o rótulo "Transferência recebida pelo Pix".
 * Medido no extrato real que motivou isto: 4 sugestões cobriam 88% das linhas.
 */
describe('ações em massa por tipo de operação', () => {
  it('reduz um extrato de muitas contrapartes a poucas decisões', async () => {
    const extrato = [
      ...Array.from({ length: 30 }, (_, i) => linha(`Transferência recebida pelo Pix - Cliente ${i}`, 100, 'INCOME')),
      ...Array.from({ length: 10 }, (_, i) => linha(`Transferência enviada pelo Pix - Fornecedor ${i}`, 50)),
    ];

    const lotes = sugerirLotes(await categorizar(extrato));

    expect(lotes).toHaveLength(2);
    expect(lotes[0]).toMatchObject({ prefixo: 'Transferência recebida pelo Pix', pendentes: 30 });
    // Duas decisões cobrem os 40 lançamentos.
    expect(lotes.reduce((s, l) => s + l.pendentes, 0)).toBe(40);
  });

  it('separa entrada de saída — receber e pagar não são a mesma decisão', async () => {
    const extrato = [
      ...Array.from({ length: 5 }, () => linha('Transferência pelo Pix - Alguem', 10, 'INCOME')),
      ...Array.from({ length: 5 }, () => linha('Transferência pelo Pix - Outro', 10, 'EXPENSE')),
    ];
    const lotes = sugerirLotes(await categorizar(extrato));
    expect(lotes).toHaveLength(2);
    expect(new Set(lotes.map((l) => l.tipo))).toEqual(new Set(['INCOME', 'EXPENSE']));
  });

  it('não sugere lote para o que já foi resolvido', async () => {
    const extrato = Array.from({ length: 5 }, () => linha('Compra no débito - Supermercado Bom Preco', 100));
    // A regra já resolveu tudo: não há o que sugerir.
    expect(sugerirLotes(await categorizar(extrato))).toHaveLength(0);
  });

  it('ignora lote pequeno demais para valer uma sugestão', async () => {
    const extrato = [linha('Transferência recebida pelo Pix - Um', 10, 'INCOME')];
    expect(sugerirLotes(await categorizar(extrato))).toHaveLength(0);
  });

  it('extrai o rótulo da operação antes do nome da contraparte', () => {
    expect(prefixoDaOperacao('Transferência recebida pelo Pix - João Silva'))
      .toBe('Transferência recebida pelo Pix');
    expect(prefixoDaOperacao('Compra no débito - Padaria')).toBe('Compra no débito');
  });

  it('funciona em descrição sem separador, usando as primeiras palavras', () => {
    expect(prefixoDaOperacao('PAGAMENTO FATURA CARTAO 1234')).toBe('PAGAMENTO FATURA CARTAO');
    expect(prefixoDaOperacao('Pagamento de fatura')).toBe('Pagamento de fatura');
  });
});

describe('regras que valem para qualquer perfil', () => {
  it('nunca junta entrada e saída da mesma contraparte no mesmo grupo', async () => {
    const extrato = [
      linha('Transferência enviada pelo Pix - João', 100, 'EXPENSE'),
      linha('Transferência recebida pelo Pix - João', 100, 'INCOME'),
    ];
    const grupos = agrupar(await categorizar(extrato));
    expect(grupos).toHaveLength(2);
  });

  it('mostra primeiro o que precisa de revisão, e dentro disso o que economiza mais trabalho', async () => {
    const extrato = [
      linha('Compra no débito - Supermercado', 100),         // regra resolve
      linha('Transferência recebida pelo Pix - Fulano', 50, 'INCOME'),
      linha('Transferência recebida pelo Pix - Fulano', 50, 'INCOME'),
      linha('Transferência recebida pelo Pix - Fulano', 50, 'INCOME'),
      linha('Transferência recebida pelo Pix - Beltrano', 10, 'INCOME'),
    ];

    const grupos = agrupar(await categorizar(extrato));

    expect(grupos[0].precisaRevisao).toBe(true);
    expect(grupos[0].quantidade).toBe(3);           // o maior grupo pendente vem primeiro
    expect(grupos[grupos.length - 1].precisaRevisao).toBe(false); // resolvido por último
  });

  it('palpite de IA não vira memória — erro do modelo não pode se perpetuar', () => {
    const comPalpite = [{
      descricao: 'LOJA XYZ', chaveDeAprendizado: 'loja xyz',
      categoriaSugerida: 'Mercado', confianca: 'ia',
    }];
    expect(memoriaAprendida(comPalpite)).toEqual({});
  });

  it('"Outros" não vira memória — não é uma decisão, é a falta dela', () => {
    const semDecisao = [{
      descricao: 'ALGO', chaveDeAprendizado: 'algo',
      categoriaSugerida: 'Outros', confianca: 'usuario',
    }];
    expect(memoriaAprendida(semDecisao)).toEqual({});
  });

  it('lançamento sem contraparte identificável não é jogado num balde comum', async () => {
    const extrato = [linha('Pagamento de fatura', 1200), linha('Pagamento de fatura', 900)];
    const grupos = agrupar(await categorizar(extrato));
    // Mesma descrição real = mesmo grupo. O que não pode é agrupar coisas
    // sem relação só porque as duas ficaram sem chave.
    expect(grupos).toHaveLength(1);
    expect(grupos[0].quantidade).toBe(2);
  });
});
