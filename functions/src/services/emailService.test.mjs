import { describe, it, expect } from 'vitest';
import { criarEmailService } from './emailService.js';

const CONFIG = { chave: 're_chave-de-teste', remetente: 'suporte@revelacash.com.br' };

function httpFalso(resposta) {
  const chamadas = [];
  const http = async (url, opcoes) => {
    chamadas.push({ url, opcoes, corpo: JSON.parse(opcoes.body) });
    return resposta;
  };
  return { http, chamadas };
}

const ok = (corpo = { id: 'email-123' }) => ({
  ok: true, status: 200, json: async () => corpo, text: async () => JSON.stringify(corpo),
});

const falha = (status, corpo) => ({
  ok: false, status, text: async () => corpo, json: async () => ({}),
});

describe('enviar — caminho feliz', () => {
  it('manda para o Resend e devolve o id', async () => {
    const { http, chamadas } = httpFalso(ok());
    const servico = criarEmailService({ ...CONFIG, http });

    const r = await servico.enviar({ para: 'cliente@example.com', assunto: 'oi', texto: 'texto' });

    expect(r).toEqual({ enviado: true, id: 'email-123' });
    expect(chamadas[0].url).toBe('https://api.resend.com/emails');
    expect(chamadas[0].opcoes.headers.Authorization).toBe('Bearer re_chave-de-teste');
  });

  it('monta o remetente com nome', async () => {
    const { http, chamadas } = httpFalso(ok());
    const servico = criarEmailService({ ...CONFIG, http });

    await servico.enviar({ para: 'x@y.com', assunto: 'a', texto: 'b' });

    expect(chamadas[0].corpo.from).toBe('RevelaCash <suporte@revelacash.com.br>');
    expect(chamadas[0].corpo.to).toEqual(['x@y.com']);
  });

  it('manda texto puro, nunca HTML', async () => {
    const { http, chamadas } = httpFalso(ok());
    const servico = criarEmailService({ ...CONFIG, http });

    await servico.enviar({ para: 'x@y.com', assunto: 'a', texto: 'b' });

    expect(chamadas[0].corpo.text).toBe('b');
    expect(chamadas[0].corpo.html).toBeUndefined();
  });
});

describe('enviar — desligado', () => {
  it('sem chave, não toca na rede', async () => {
    const { http, chamadas } = httpFalso(ok());
    const servico = criarEmailService({ chave: null, remetente: 'x@y.com', http });

    const r = await servico.enviar({ para: 'a@b.com', assunto: 'a', texto: 'b' });

    expect(r).toEqual({ enviado: false, motivo: 'desligado' });
    expect(chamadas).toHaveLength(0);
  });

  it('sem remetente, também não', async () => {
    const { http, chamadas } = httpFalso(ok());
    const servico = criarEmailService({ chave: 're_x', remetente: null, http });

    expect(await servico.enviar({ para: 'a@b.com', assunto: 'a', texto: 'b' }))
      .toEqual({ enviado: false, motivo: 'desligado' });
    expect(chamadas).toHaveLength(0);
  });

  it('sem destinatário, não inventa envio', async () => {
    const { http, chamadas } = httpFalso(ok());
    const servico = criarEmailService({ ...CONFIG, http });

    expect(await servico.enviar({ para: null, assunto: 'a', texto: 'b' }))
      .toEqual({ enviado: false, motivo: 'sem-destinatario' });
    expect(chamadas).toHaveLength(0);
  });
});

describe('enviar — nunca lança', () => {
  it('erro do provedor vira resultado, com o corpo da resposta junto', async () => {
    // O corpo importa: 403 pode ser domínio não verificado e 422 remetente
    // errado — diagnósticos diferentes com a mesma cara se só o status sobrar.
    const { http } = httpFalso(falha(403, '{"message":"The revelacash.com.br domain is not verified"}'));
    const servico = criarEmailService({ ...CONFIG, http });

    const r = await servico.enviar({ para: 'a@b.com', assunto: 'a', texto: 'b' });

    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe('falha-envio');
    expect(r.erro).toContain('403');
    expect(r.erro).toContain('not verified');
  });

  it('exceção de rede não escapa', async () => {
    const servico = criarEmailService({
      ...CONFIG,
      http: async () => { throw new Error('getaddrinfo ENOTFOUND api.resend.com'); },
    });

    const r = await servico.enviar({ para: 'a@b.com', assunto: 'a', texto: 'b' });

    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe('erro');
    expect(r.erro).toContain('ENOTFOUND');
  });

  it('resposta ok com corpo ilegível ainda conta como enviada', async () => {
    const servico = criarEmailService({
      ...CONFIG,
      http: async () => ({ ok: true, status: 200, json: async () => { throw new Error('corpo vazio'); } }),
    });

    expect(await servico.enviar({ para: 'a@b.com', assunto: 'a', texto: 'b' }))
      .toEqual({ enviado: true, id: null });
  });
});
