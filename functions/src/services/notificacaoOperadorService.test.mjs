import { describe, it, expect, vi } from 'vitest';
import {
  criarNotificador,
  montarAvisoDeCadastro,
  destinoDe,
} from './notificacaoOperadorService.js';

/**
 * Config do canal e envio dublados por injeção (regra 2: nada de mock de
 * módulo, nada perto do Firestore real).
 *
 * O que estes testes protegem, em ordem de importância:
 *  1. cadastro NUNCA quebra por causa do aviso — canal fora do ar, envio
 *     falhando ou exceção crua terminam em `{enviado:false}`, jamais em throw;
 *  2. sem a variável de ambiente, ninguém é notificado e nem se consulta o
 *     Firestore (é o estado de teste e de qualquer ambiente que não seja a
 *     produção do operador);
 *  3. o aviso vai pro número do operador mesmo quando a família dele está em
 *     modo grupo — aviso de negócio não pode cair no grupo da família;
 *  4. o texto leva nome e telefone, e não leva e-mail.
 */

function criarAmbiente({
  config = { enabled: true, ownerJid: '5564999555364@s.whatsapp.net' },
  resposta = { enviado: true, messageId: 'msg-1' },
  householdIdDoOperador = 'fam-operador',
  destinoForcado = null,
  getRawConfig = null,
  enviarWhatsapp = null,
} = {}) {
  const envios = [];

  const getRaw = getRawConfig || vi.fn(async () => config);
  const enviar = enviarWhatsapp || vi.fn(async (householdId, cfg, destino, texto) => {
    envios.push({ householdId, destino, texto });
    return resposta;
  });

  return {
    notificador: criarNotificador({
      getRawConfig: getRaw,
      enviarWhatsapp: enviar,
      householdIdDoOperador,
      destinoForcado,
    }),
    envios,
    getRawConfig: getRaw,
    enviarWhatsapp: enviar,
  };
}

describe('montarAvisoDeCadastro', () => {
  it('leva nome e telefone formatado', () => {
    const texto = montarAvisoDeCadastro({ nome: 'Ana Silva', telefone: '5511912345678' });
    expect(texto).toContain('Ana Silva');
    expect(texto).toContain('(11) 91234-5678');
  });

  it('não vaza e-mail nem outro dado do cliente', () => {
    const texto = montarAvisoDeCadastro({
      nome: 'Ana Silva',
      telefone: '5511912345678',
      email: 'ana@exemplo.com',
    });
    expect(texto).not.toContain('@');
  });

  it('aguenta cadastro sem telefone sem quebrar o texto', () => {
    const texto = montarAvisoDeCadastro({ nome: 'Ana Silva', telefone: null });
    expect(texto).toContain('Ana Silva');
    expect(texto).toContain('não informado');
  });
});

describe('destinoDe', () => {
  it('prefere o número do dono ao grupo, mesmo em modo grupo', () => {
    const config = { modo: 'grupo', ownerJid: 'dono@s.whatsapp.net', groupId: 'grupo@g.us' };
    expect(destinoDe(config)).toBe('dono@s.whatsapp.net');
  });

  it('cai pro grupo quando não há dono registrado', () => {
    expect(destinoDe({ modo: 'grupo', groupId: 'grupo@g.us' })).toBe('grupo@g.us');
  });

  it('respeita destino forçado por ambiente', () => {
    const config = { ownerJid: 'dono@s.whatsapp.net' };
    expect(destinoDe(config, 'outro@s.whatsapp.net')).toBe('outro@s.whatsapp.net');
  });

  it('devolve null quando não há para onde mandar', () => {
    expect(destinoDe({ enabled: true })).toBeNull();
  });
});

describe('notificarCadastro', () => {
  it('envia o aviso pelo canal do operador', async () => {
    const { notificador, envios } = criarAmbiente();

    const r = await notificador.notificarCadastro({ nome: 'Ana Silva', telefone: '5511912345678' });

    expect(r).toMatchObject({ enviado: true, messageId: 'msg-1' });
    expect(envios).toHaveLength(1);
    expect(envios[0].householdId).toBe('fam-operador');
    expect(envios[0].destino).toBe('5564999555364@s.whatsapp.net');
    expect(envios[0].texto).toContain('Ana Silva');
  });

  it('sem householdId configurado, não notifica nem consulta o Firestore', async () => {
    const { notificador, getRawConfig, envios } = criarAmbiente({ householdIdDoOperador: null });

    const r = await notificador.notificarCadastro({ nome: 'Ana', telefone: '5511912345678' });

    expect(r).toMatchObject({ enviado: false, motivo: 'desligado' });
    expect(getRawConfig).not.toHaveBeenCalled();
    expect(envios).toHaveLength(0);
  });

  it('canal do operador desativado não envia e não lança', async () => {
    const { notificador, envios } = criarAmbiente({ config: { enabled: false, ownerJid: 'x@s.whatsapp.net' } });

    const r = await notificador.notificarCadastro({ nome: 'Ana', telefone: '5511912345678' });

    expect(r).toMatchObject({ enviado: false, motivo: 'canal-inativo' });
    expect(envios).toHaveLength(0);
  });

  it('canal sem número nem grupo vinculado não envia e não lança', async () => {
    const { notificador } = criarAmbiente({ config: { enabled: true } });

    const r = await notificador.notificarCadastro({ nome: 'Ana', telefone: '5511912345678' });

    expect(r).toMatchObject({ enviado: false, motivo: 'sem-destino' });
  });

  it('falha do provider vira resultado, nunca exceção', async () => {
    const { notificador } = criarAmbiente({ resposta: { enviado: false, erro: 'instância fora do ar' } });

    const r = await notificador.notificarCadastro({ nome: 'Ana', telefone: '5511912345678' });

    expect(r).toMatchObject({ enviado: false, motivo: 'falha-envio', erro: 'instância fora do ar' });
  });

  it('exceção crua na leitura da config não escapa (cadastro não pode quebrar)', async () => {
    const { notificador } = criarAmbiente({
      getRawConfig: vi.fn(async () => { throw new Error('Firestore indisponível'); }),
    });

    const r = await notificador.notificarCadastro({ nome: 'Ana', telefone: '5511912345678' });

    expect(r).toMatchObject({ enviado: false, motivo: 'erro', erro: 'Firestore indisponível' });
  });
});
