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

  it('saudação NÃO vira nome de subcategoria', () => {
    // A pessoa lança de manhã, o sistema oferece, ela cumprimenta — e ficava
    // com uma subcategoria chamada *Bom Dia*, com direito a confirmação.
    for (const t of ['bom dia', 'Bom dia!', 'boa noite', 'oi', 'obrigado', 'valeu', 'kkk']) {
      expect(responder(t)).toBeNull();
    }
  });

  it('mas "sim" e "não" continuam sendo resposta, não conversa fiada', () => {
    // Os dois estão na mesma lista de conversa fiada; aqui eles decidem.
    expect(responder('sim')).toEqual({ acao: 'CRIAR', nome: 'Ração' });
    expect(responder('não')).toEqual({ acao: 'RECUSAR' });
  });

  it('nome que por acaso parece conversa fiada ainda passa com a categoria junto', () => {
    // "Show" sozinho é comemoração; "Show em Lazer" é um pedido claro.
    expect(responder('Show')).toBeNull();
    expect(responder('Show em Lazer')).toEqual({ acao: 'CRIAR', nome: 'Show', categoria: 'Lazer' });
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
    expect(texto).toContain('subcategoria *Ração*');
    expect(texto).toContain('categoria *Outros*');
    expect(texto).toContain('2x');
    expect(texto).toContain('não');
  });

  it('a confirmação explica a exatidão do nome', () => {
    const texto = montarConfirmacaoDeCriacao({
      nome: 'Pet', categoriaNome: 'Casa', descricao: 'ração cachorro',
    });
    // Nomear os dois níveis: "Criei Pet em Casa" não diz que Casa é categoria.
    expect(texto).toContain('subcategoria *Pet*');
    expect(texto).toContain('categoria *Casa*');
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
