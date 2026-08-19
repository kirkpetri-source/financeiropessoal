import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { decidirSemIA, decidirComIntencao, DESTINO } = require('./roteadorMensagem.js');
const { parseFinancialMessage } = require('./financialParser.js');

/**
 * O roteador fica no caminho do lançamento, que é a função principal do
 * produto. Um erro aqui não gera erro visível — gera um gasto que virou
 * conversa, ou uma conversa que virou lançamento fantasma.
 *
 * Por isso a bateria abaixo usa o PARSER DE VERDADE para decidir se a regra
 * casou, e não um booleano inventado: o que está sendo testado é o
 * comportamento real do conjunto.
 */

const MEMBROS = ['Kirk', 'Raquel'];

function rotear(texto, { nome = 'Nina', ehComando = false, assistenteAtiva = true } = {}) {
  const casouRegra = !!parseFinancialMessage(texto, MEMBROS);
  return decidirSemIA({ texto, nomeDaAssistente: nome, ehComando, casouRegra, assistenteAtiva });
}

describe('lançamento continua sendo lançamento — o que NÃO pode regredir', () => {
  const LANCAMENTOS_REAIS = [
    'gastei 84,90 no mercado',
    'paguei 50 de gasolina no pix',
    'comprei 1200 de geladeira',
    'recebi 2500 de salário',
    'ganhei 250 de um serviço',
    'gastei 84,90 no mercado raquel',
    'paguei 120 de energia no débito',
    'gastei 30 pila no pão',
    'recebi 1500 de aluguel',
    'paguei 89,90 da internet',
  ];

  for (const texto of LANCAMENTOS_REAIS) {
    it(`"${texto}" -> LANCAMENTO, sem IA`, () => {
      const r = rotear(texto);
      expect(r.destino).toBe(DESTINO.LANCAMENTO);
      expect(r.motivo).toBe('REGRA_DE_LANCAMENTO');
    });
  }

  it('nenhum lançamento por regra chega a precisar de IA', () => {
    for (const texto of LANCAMENTOS_REAIS) {
      expect(rotear(texto).destino, texto).not.toBeNull();
    }
  });
});

describe('chamado pelo nome vence tudo', () => {
  it('pergunta com o nome vai para o chat', () => {
    const r = rotear('Nina, quanto gastei em mercado?');
    expect(r.destino).toBe(DESTINO.CHAT);
    expect(r.texto).toBe('quanto gastei em mercado?');
  });

  // O caso que só o nome resolve: a frase seguinte casaria na regra de
  // lançamento, mas a pessoa disse com quem quer falar.
  it('com o nome na frente, frase de lançamento vira conversa', () => {
    const r = rotear('Nina, gastei 200 no mercado, tá muito?');
    expect(r.destino).toBe(DESTINO.CHAT);
    expect(r.motivo).toBe('CHAMOU_PELO_NOME');
    expect(r.texto).toBe('gastei 200 no mercado, tá muito?');
  });

  it('o nome vence até um comando conhecido', () => {
    const r = rotear('Nina, resumo do mês passado', { ehComando: true });
    expect(r.destino).toBe(DESTINO.CHAT);
  });

  it('respeita o nome que a família escolheu', () => {
    expect(rotear('Rodolfo, quanto gastei?', { nome: 'Rodolfo' }).destino).toBe(DESTINO.CHAT);
    expect(rotear('Nina, quanto gastei?', { nome: 'Rodolfo' }).destino).not.toBe(DESTINO.CHAT);
  });

  it('tolera erro de transcrição de áudio', () => {
    expect(rotear('Nyna, quanto gastei?').destino).toBe(DESTINO.CHAT);
  });

  // "vou levar a Nina no mercado" não é alguém falando com a assistente.
  it('nome no meio da frase não é chamado', () => {
    const r = rotear('gastei 50 levando a Nina no mercado');
    expect(r.destino).not.toBe(DESTINO.CHAT);
  });
});

describe('comandos continuam de graça', () => {
  it('comando conhecido não passa por IA', () => {
    const r = rotear('resumo', { ehComando: true });
    expect(r.destino).toBe(DESTINO.COMANDO);
  });

  it('comando vem antes da regra de lançamento', () => {
    // "apagar ultimo" não é lançamento, mas é comando.
    expect(rotear('apagar ultimo', { ehComando: true }).destino).toBe(DESTINO.COMANDO);
  });
});

describe('o que a regra não entende fica indefinido, esperando a IA', () => {
  const PRECISAM_DE_IA = [
    'quanto gastei em mercado esse mês?',
    'como posso diminuir minhas despesas?',
    'quais são minhas subcategorias?',
    'lanche 38,00 crédito',
    'bom dia',
  ];

  for (const texto of PRECISAM_DE_IA) {
    it(`"${texto}" -> indefinido`, () => {
      expect(rotear(texto).destino).toBeNull();
    });
  }
});

describe('mensagem vazia', () => {
  it('é ignorada sem custo', () => {
    expect(rotear('').destino).toBe(DESTINO.IGNORAR);
    expect(rotear('    ').destino).toBe(DESTINO.IGNORAR);
  });
});

describe('assistente desligada', () => {
  it('o nome deixa de ser reconhecido', () => {
    const r = rotear('Nina, quanto gastei?', { assistenteAtiva: false });
    expect(r.destino).not.toBe(DESTINO.CHAT);
  });

  it('lançamento continua funcionando normalmente', () => {
    const r = rotear('gastei 84,90 no mercado', { assistenteAtiva: false });
    expect(r.destino).toBe(DESTINO.LANCAMENTO);
  });

  it('comando continua funcionando', () => {
    expect(rotear('resumo', { ehComando: true, assistenteAtiva: false }).destino).toBe(DESTINO.COMANDO);
  });
});

describe('decisão depois que a IA classifica', () => {
  it('PERGUNTA vai para o chat', () => {
    const r = decidirComIntencao({ texto: 'quanto gastei?', intencao: 'PERGUNTA' });
    expect(r.destino).toBe(DESTINO.CHAT);
  });

  it('LANCAMENTO segue para o fluxo de lançamento', () => {
    const r = decidirComIntencao({ texto: 'lanche 38 crédito', intencao: 'LANCAMENTO', temLancamentos: true });
    expect(r.destino).toBe(DESTINO.LANCAMENTO);
  });

  it('OUTRO sem lançamento nenhum é ignorado, sem responder "não entendi"', () => {
    const r = decidirComIntencao({ texto: 'bom dia', intencao: 'OUTRO', temLancamentos: false });
    expect(r.destino).toBe(DESTINO.IGNORAR);
  });

  it('OUTRO mas com lançamento extraído ainda lança', () => {
    // A IA às vezes classifica mal e acerta a extração. O dado vence o rótulo.
    const r = decidirComIntencao({ texto: '50 no posto', intencao: 'OUTRO', temLancamentos: true });
    expect(r.destino).toBe(DESTINO.LANCAMENTO);
  });

  // Com a feature desligada, uma pergunta não tem para onde ir. Cair no fluxo
  // antigo faz ele responder "não entendi", que é o comportamento de sempre —
  // melhor que silêncio.
  it('PERGUNTA com assistente desligada volta ao fluxo antigo', () => {
    const r = decidirComIntencao({ texto: 'quanto gastei?', intencao: 'PERGUNTA', assistenteAtiva: false });
    expect(r.destino).toBe(DESTINO.LANCAMENTO);
  });

  it('intenção desconhecida não trava nada', () => {
    const r = decidirComIntencao({ texto: 'algo', intencao: undefined, temLancamentos: true });
    expect(r.destino).toBe(DESTINO.LANCAMENTO);
  });
});
