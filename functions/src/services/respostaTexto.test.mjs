import { describe, it, expect } from 'vitest';
import resposta from './respostaTexto.js';
import { looksLikeFinancialMessage } from '../utils/financialParser.js';

const { montarConfirmacao, ehMensagemDoBot, assinar, ASSINATURA } = resposta;

/**
 * Proteção contra loop.
 *
 * O bot roda no MESMO número do usuário, então tudo que ele envia volta pelo
 * webhook como se o usuário tivesse mandado. E a confirmação tem número e tem
 * "R$": passa pelo filtro financeiro e vira lançamento, que gera confirmação,
 * que vira lançamento. Estes testes existem para que ninguém remova a
 * assinatura invisível sem perceber o que ela segura.
 */

const TRANSACAO = {
  type: 'EXPENSE',
  amount: 84.9,
  description: 'mercado',
  paidBy: 'Raquel',
  category: { name: 'Mercado' },
};

describe('proteção contra loop', () => {
  it('a confirmação SERIA confundida com lançamento se não fosse assinada', () => {
    const texto = montarConfirmacao(null, TRANSACAO);

    // É exatamente por isto que a assinatura existe: o texto tem número e "R$".
    expect(looksLikeFinancialMessage(texto)).toBe(true);
  });

  it('reconhece a própria mensagem pela assinatura', () => {
    const texto = assinar(montarConfirmacao(null, TRANSACAO));
    expect(ehMensagemDoBot(texto)).toBe(true);
  });

  it('não confunde mensagem de usuário com mensagem do bot', () => {
    expect(ehMensagemDoBot('mercado 84,90 pix')).toBe(false);
    expect(ehMensagemDoBot('✅ registrei aqui, valeu')).toBe(false);
    expect(ehMensagemDoBot('')).toBe(false);
    expect(ehMensagemDoBot(null)).toBe(false);
    expect(ehMensagemDoBot(undefined)).toBe(false);
  });

  it('a assinatura é invisível para quem lê', () => {
    const texto = assinar('Lançamento registrado');
    // Some ao remover caracteres de largura zero: o usuário lê o texto limpo.
    expect(texto.replace(/[​-‍﻿]/g, '')).toBe('Lançamento registrado');
  });

  it('a assinatura sobrevive a texto multilinha', () => {
    const texto = assinar('✅ 3 lançamentos registrados:\n• mercado\n• uber');
    expect(ehMensagemDoBot(texto)).toBe(true);
  });

  it('usa caractere de largura zero, não um marcador visível', () => {
    // U+200C (zero-width non-joiner). Não dá para usar trim() aqui: ele remove
    // espaço, e o ZWNJ é caractere de formatação, não espaço.
    expect(ASSINATURA).toHaveLength(1);
    expect(ASSINATURA.codePointAt(0)).toBe(0x200c);
  });
});

describe('montarConfirmacao', () => {
  it('aplica o modelo padrão quando a família não configurou nenhum', () => {
    expect(montarConfirmacao(null, TRANSACAO)).toBe('✅ despesa de R$ 84,90 em Mercado');
  });

  it('formata o valor no padrão brasileiro', () => {
    expect(montarConfirmacao(null, { ...TRANSACAO, amount: 1500 }))
      .toContain('R$ 1.500,00');
    expect(montarConfirmacao(null, { ...TRANSACAO, amount: 5 }))
      .toContain('R$ 5,00');
  });

  it('traduz o tipo do lançamento', () => {
    expect(montarConfirmacao(null, { ...TRANSACAO, type: 'INCOME' })).toContain('receita');
    expect(montarConfirmacao(null, { ...TRANSACAO, type: 'EXPENSE' })).toContain('despesa');
  });

  it('substitui todas as variáveis do modelo', () => {
    const modelo = '{tipo}|{valor}|{categoria}|{descricao}|{pagador}';
    expect(montarConfirmacao(modelo, TRANSACAO)).toBe('despesa|84,90|Mercado|mercado|Raquel');
  });

  it('não deixa variável sem substituir no modelo', () => {
    const texto = montarConfirmacao('{tipo} {valor} {categoria} {descricao} {pagador}', TRANSACAO);
    expect(texto).not.toMatch(/\{[a-z]+\}/);
  });

  it('aguenta categoria e pagador ausentes', () => {
    const texto = montarConfirmacao(null, { type: 'EXPENSE', amount: 10, description: 'x' });
    expect(texto).toContain('Outros');
    expect(texto).not.toContain('undefined');
  });
});
