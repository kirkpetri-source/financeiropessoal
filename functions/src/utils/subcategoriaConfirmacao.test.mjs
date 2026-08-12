import { describe, it, expect } from 'vitest';
import { telefoneDe, montarPerguntaSubcategoria, resolverRespostaConfirmacao } from './subcategoriaConfirmacao.js';

const OPCOES = [
  { id: 'sub-padaria', name: 'Padaria' },
  { id: 'sub-restaurante', name: 'Restaurante' },
];

describe('telefoneDe', () => {
  it('extrai o número puro de um jid de chat privado', () => {
    expect(telefoneDe('556496130798@s.whatsapp.net')).toBe('556496130798');
  });

  it('extrai o número puro de um jid de participante de grupo', () => {
    expect(telefoneDe('556496130798@lid')).toBe('556496130798');
  });

  it('devolve null para jid vazio ou ausente', () => {
    expect(telefoneDe(null)).toBeNull();
    expect(telefoneDe(undefined)).toBeNull();
    expect(telefoneDe('')).toBeNull();
  });
});

describe('montarPerguntaSubcategoria', () => {
  it('numera as opções e ensina a responder', () => {
    const texto = montarPerguntaSubcategoria('Mercado', OPCOES);
    expect(texto).toContain('*Mercado*');
    expect(texto).toContain('1) Padaria');
    expect(texto).toContain('2) Restaurante');
    expect(texto).toContain('pular');
  });
});

describe('resolverRespostaConfirmacao', () => {
  it('casa por número (1-based)', () => {
    const resultado = resolverRespostaConfirmacao(OPCOES, '1');
    expect(resultado).toMatchObject({ subcategoryId: 'sub-padaria' });
  });

  it('casa por nome exato, sem acento nem maiúscula', () => {
    const resultado = resolverRespostaConfirmacao(OPCOES, 'RESTAURANTE');
    expect(resultado).toMatchObject({ subcategoryId: 'sub-restaurante' });
  });

  it('casa "pular" e limpa a subcategoria', () => {
    const resultado = resolverRespostaConfirmacao(OPCOES, 'pular');
    expect(resultado).toMatchObject({ subcategoryId: null });
  });

  it('casa outros gatilhos de limpar', () => {
    expect(resolverRespostaConfirmacao(OPCOES, 'sem subcategoria')).toMatchObject({ subcategoryId: null });
    expect(resolverRespostaConfirmacao(OPCOES, 'cancelar')).toMatchObject({ subcategoryId: null });
  });

  it('número fora do intervalo não bate', () => {
    expect(resolverRespostaConfirmacao(OPCOES, '99')).toBeNull();
    expect(resolverRespostaConfirmacao(OPCOES, '0')).toBeNull();
  });

  it('texto que não bate com nada devolve null — mensagem segue como nova', () => {
    expect(resolverRespostaConfirmacao(OPCOES, 'gastei 50 no mercado')).toBeNull();
  });
});
