import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { mensagemLimiteIA, mensagemLimiteChat } = require('./mensagensDeLimite.js');

/**
 * As duas mensagens seguem o mesmo contrato, então testam a mesma coisa:
 * dizer o que aconteceu, garantir que nada se perdeu, MOSTRAR O CAMINHO QUE
 * CONTINUA ABERTO e informar quando volta.
 */

const CASOS = [
  ['limite de lançamento por IA', mensagemLimiteIA],
  ['limite de conversa', mensagemLimiteChat],
];

describe.each(CASOS)('%s', (_nome, montar) => {
  it('informa a data do retorno', () => {
    expect(montar(new Date('2026-08-18T15:00:00Z'))).toContain('19/08');
  });

  it('informa a hora e o fuso, para não haver dúvida', () => {
    const texto = montar(new Date('2026-08-18T15:00:00Z'));
    expect(texto).toContain('meia-noite');
    expect(texto).toContain('Brasília');
  });

  it('atravessa a virada de mês', () => {
    expect(montar(new Date('2026-08-31T15:00:00Z'))).toContain('01/09');
  });

  it('atravessa a virada de ano', () => {
    expect(montar(new Date('2026-12-31T15:00:00Z'))).toContain('01/01');
  });

  // Às 22h de Brasília o servidor (UTC) já virou o dia. Somar 24h sobre a data
  // dele diria "amanhã, 20/08" para quem ainda está no dia 18.
  it('às 22h de Brasília, amanhã é o dia seguinte — não dois', () => {
    expect(montar(new Date('2026-08-19T01:00:00Z'))).toContain('19/08');
  });

  // O ponto da mensagem não é avisar que acabou: é garantir que ninguém fique
  // sem saber como registrar um gasto agora.
  it('ensina o formato que funciona sem IA e sem limite', () => {
    const texto = montar();
    expect(texto).toContain('gastei 84,90 no mercado');
    // As duas dizem a mesma coisa com palavras diferentes ("sem limite nenhum"
    // e "não têm limite"); o que importa é a promessa estar lá.
    expect(texto.toLowerCase()).toMatch(/sem limite|n[ãa]o t[êe]m limite/);
  });

  it('não deixa a pessoa achando que perdeu dado', () => {
    const texto = montar().toLowerCase();
    expect(texto).toMatch(/nada foi perdido|continuam salvos|continua tudo funcionando/);
  });
});

describe('diferença entre as duas', () => {
  it('a de lançamento fala de áudio e foto de cupom', () => {
    const texto = mensagemLimiteIA();
    expect(texto).toContain('áudio');
    expect(texto).toContain('cupom');
  });

  it('a de conversa lista os comandos que continuam valendo', () => {
    const texto = mensagemLimiteChat();
    expect(texto).toContain('resumo');
    expect(texto).toContain('ultimos');
    expect(texto).toContain('categorias');
  });
});
