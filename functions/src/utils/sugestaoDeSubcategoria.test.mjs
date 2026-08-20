import { describe, it, expect } from 'vitest';
import {
  nomeSugerido, interpretarResposta, montarConfirmacaoDeCriacao, montarOfertaDeCriacao,
} from './sugestaoDeSubcategoria.js';

describe('nomeSugerido', () => {
  it('pega a primeira palavra que tem significado', () => {
    expect(nomeSugerido('ração cachorro')).toBe('Ração');
    expect(nomeSugerido('pizza sexta')).toBe('Pizza');
  });

  it('pula preposição e verbo de lançamento', () => {
    expect(nomeSugerido('gastei na padaria')).toBe('Padaria');
    expect(nomeSugerido('compra de ração')).toBe('Ração');
    expect(nomeSugerido('paguei o uber')).toBe('Uber');
  });

  it('mantém o acento que a pessoa escreveu', () => {
    expect(nomeSugerido('ração')).toBe('Ração');
    expect(nomeSugerido('academia')).toBe('Academia');
  });

  it('ignora palavra curta demais para virar nome', () => {
    expect(nomeSugerido('tv nova')).toBe('Nova');
  });

  it('devolve null quando não sobra nada aproveitável', () => {
    expect(nomeSugerido('de um')).toBeNull();
    expect(nomeSugerido('')).toBeNull();
    expect(nomeSugerido('   ')).toBeNull();
    expect(nomeSugerido('123 456')).toBeNull();
  });
});

describe('interpretarResposta', () => {
  const responder = (t) => interpretarResposta(t, 'Ração');

  it('aceita as formas comuns de dizer sim', () => {
    for (const t of ['sim', 'Sim', 's', 'pode', 'quero', 'criar', 'ok', 'isso']) {
      expect(responder(t)).toEqual({ acao: 'CRIAR', nome: 'Ração' });
    }
  });

  it('aceita as formas comuns de dizer não', () => {
    for (const t of ['não', 'nao', 'n', 'deixa', 'depois', 'esquece']) {
      expect(responder(t)).toEqual({ acao: 'RECUSAR' });
    }
  });

  it('um nome solto vira o nome da subcategoria', () => {
    expect(responder('Pet')).toEqual({ acao: 'CRIAR', nome: 'Pet' });
    expect(responder('animais')).toEqual({ acao: 'CRIAR', nome: 'Animais' });
  });

  it('"Nome em Categoria" muda as duas coisas', () => {
    expect(responder('Pet em Casa')).toEqual({ acao: 'CRIAR', nome: 'Pet', categoria: 'Casa' });
  });

  it('separa no ÚLTIMO "em" — nome composto continua inteiro', () => {
    const r = responder('Pet Shop em Casa');
    expect(r.nome).toBe('Pet Shop');
    expect(r.categoria).toBe('Casa');
  });

  it('frase longa não é resposta a isto', () => {
    // A pendência é single-shot: isto tem que virar lançamento novo.
    expect(responder('gastei 50 no mercado hoje de manhã')).toBeNull();
    expect(responder('quanto gastei esse mês em mercado')).toBeNull();
  });

  it('texto vazio não decide nada', () => {
    expect(responder('')).toBeNull();
    expect(responder('   ')).toBeNull();
  });
});

describe('as mensagens', () => {
  it('a oferta diz quantas vezes e oferece as saídas', () => {
    const texto = montarOfertaDeCriacao({
      descricao: 'ração cachorro', nome: 'Ração', categoriaNome: 'Outros', vezes: 2,
    });
    expect(texto).toContain('ração cachorro');
    expect(texto).toContain('Ração');
    expect(texto).toContain('Outros');
    expect(texto).toContain('2x');
    expect(texto).toContain('não');
  });

  it('a confirmação explica a exatidão do nome', () => {
    const texto = montarConfirmacaoDeCriacao({
      nome: 'Pet', categoriaNome: 'Casa', descricao: 'ração cachorro',
    });
    expect(texto).toContain('Criei *Pet* em *Casa*');
    expect(texto).toContain('ração cachorro');
    // O aviso que evita a pessoa achar que quebrou ao escrever diferente.
    expect(texto.toLowerCase()).toContain('diferente');
  });
});

/**
 * Barreira contra frase virar nome de subcategoria.
 *
 * "quanto gastei esse mês em mercado" casava no " em " e virava uma
 * subcategoria chamada "Quanto Gastei Esse M". Uma pergunta comum criando lixo
 * no cadastro da família — achado por teste antes de ir para produção.
 */
describe('frase com "em" no meio não vira subcategoria', () => {
  const responder = (t) => interpretarResposta(t, 'Ração');

  it('pergunta com "em" é recusada', () => {
    expect(responder('quanto gastei esse mês em mercado')).toBeNull();
    expect(responder('quero ver o que gastei em lazer')).toBeNull();
  });

  it('lançamento com "em" é recusado', () => {
    expect(responder('gastei 50 em mercado ontem')).toBeNull();
  });

  it('mas a resposta curta legítima continua passando', () => {
    expect(responder('Pet em Casa')).toEqual({ acao: 'CRIAR', nome: 'Pet', categoria: 'Casa' });
    expect(responder('Pet Shop em Casa').nome).toBe('Pet Shop');
  });
});
