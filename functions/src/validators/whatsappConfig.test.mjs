import { describe, it, expect } from 'vitest';
import { whatsappConfigSchema } from './whatsappConfig.js';

/**
 * Regressão de um estrago real em produção (06/08/2026).
 *
 * Uma conta conectou o WhatsApp, o grupo foi criado às 20:05:32, e às 20:06:05
 * o cliente clicou em "Salvar" na mensagem de confirmação. O formulário mandou
 * groupId e apiKey vazios, e o schema preencheu `enabled: false` por causa de
 * um `.default(false)`. Resultado: canal desligado, grupo perdido do cadastro,
 * e toda mensagem enviada no grupo descartada em silêncio.
 *
 * Estes testes existem para que nenhum campo de infraestrutura volte a entrar
 * por esta porta — nem explicitamente, nem por valor padrão.
 */

describe('configuração do canal editável pelo cliente', () => {
  it('aceita a mensagem de confirmação', () => {
    const r = whatsappConfigSchema.safeParse({ confirmationMessageTemplate: 'Ok: {valor}' });
    expect(r.success).toBe(true);
    expect(r.data.confirmationMessageTemplate).toBe('Ok: {valor}');
  });

  it('corpo vazio não inventa nenhum campo', () => {
    const r = whatsappConfigSchema.safeParse({});
    expect(r.success).toBe(true);
    // O `enabled: false` que aparecia aqui foi o que desligou o canal.
    expect(r.data).toEqual({});
    expect('enabled' in r.data).toBe(false);
    expect('allowPrivateChat' in r.data).toBe(false);
  });

  it('recusa qualquer campo de infraestrutura', () => {
    for (const campo of [
      'enabled', 'allowPrivateChat', 'modo',
      'instanceName', 'groupId', 'groupInviteUrl',
      'evolutionApiUrl', 'apiKey', 'ownerJid',
    ]) {
      const r = whatsappConfigSchema.safeParse({ [campo]: campo === 'enabled' ? false : '' });
      expect(r.success, `${campo} não pode ser aceito`).toBe(false);
    }
  });

  it('recusa o corpo inteiro que causou o estrago', () => {
    const corpoDoBug = {
      evolutionApiUrl: '',
      instanceName: '',
      apiKey: '',
      groupId: '',
      confirmationMessageTemplate: '✅ Lançamento registrado',
    };
    expect(whatsappConfigSchema.safeParse(corpoDoBug).success).toBe(false);
  });

  it('limita o tamanho do template', () => {
    expect(whatsappConfigSchema.safeParse({
      confirmationMessageTemplate: 'x'.repeat(501),
    }).success).toBe(false);
  });
});
