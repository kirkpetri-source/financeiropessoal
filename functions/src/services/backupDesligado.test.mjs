import { describe, it, expect, afterEach } from 'vitest';
import { backupDesligado } from './backupDesligado.js';

/**
 * O ponto destes testes é um só: desligar backup precisa ser uma DECLARAÇÃO,
 * nunca um efeito colateral de configuração faltando. Ambiente sem a variável
 * faz backup — é assim que produção continua protegida mesmo se alguém mexer
 * no `.env` sem querer.
 */
describe('backupDesligado', () => {
  const original = process.env.BACKUP_ATIVO;
  afterEach(() => {
    if (original === undefined) delete process.env.BACKUP_ATIVO;
    else process.env.BACKUP_ATIVO = original;
  });

  it('sem a variável, o backup está LIGADO', () => {
    delete process.env.BACKUP_ATIVO;
    expect(backupDesligado()).toBe(false);
  });

  it('com a variável vazia, o backup está LIGADO', () => {
    process.env.BACKUP_ATIVO = '';
    expect(backupDesligado()).toBe(false);
  });

  it('só "false" explícito desliga', () => {
    process.env.BACKUP_ATIVO = 'false';
    expect(backupDesligado()).toBe(true);
  });

  it('aceita espaço e caixa diferente — o .env é escrito à mão', () => {
    process.env.BACKUP_ATIVO = ' FALSE ';
    expect(backupDesligado()).toBe(true);
  });

  it('qualquer outro valor mantém ligado', () => {
    for (const valor of ['true', '0', 'nao', 'desligado']) {
      process.env.BACKUP_ATIVO = valor;
      expect(backupDesligado()).toBe(false);
    }
  });
});
