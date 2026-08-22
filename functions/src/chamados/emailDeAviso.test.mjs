import { describe, it, expect } from 'vitest';
import { montarAviso, escapar, LOGO } from './emailDeAviso.js';

const BASE = {
  numero: 42,
  assunto: 'Seu chamado #42 teve resposta',
  titulo: 'O suporte respondeu você.',
  explicacao: 'Abra o chamado para ler a resposta.',
  link: 'https://www.revelacash.com.br/suporte/42',
  rotuloDoBotao: 'Ver a resposta',
  paraOperador: false,
};

describe('montarAviso — as duas versões', () => {
  it('devolve assunto, html e texto', () => {
    const a = montarAviso(BASE);

    expect(a.assunto).toBe(BASE.assunto);
    expect(a.html).toContain('<!doctype html>');
    expect(a.texto).toBeTruthy();
  });

  it('o texto puro não tem marcação nenhuma', () => {
    // Leitor de tela e cliente antigo usam esta versão. HTML escapando para
    // dentro dela apareceria como lixo literal na tela da pessoa.
    expect(montarAviso(BASE).texto).not.toMatch(/[<>]/);
  });

  it('as duas versões levam o número e o link', () => {
    const a = montarAviso(BASE);

    for (const corpo of [a.html, a.texto]) {
      expect(corpo).toContain('42');
      expect(corpo).toContain(BASE.link);
    }
  });
});

describe('identidade visual', () => {
  const html = montarAviso(BASE).html;

  it('usa o roxo da marca', () => {
    expect(html).toContain('#512b8d');
  });

  it('o nome da marca é TEXTO, não só imagem', () => {
    // Cliente de e-mail bloqueia imagem por padrão em muita gente. Com o nome
    // só no logo, o e-mail chegaria como um retângulo vazio sem identidade.
    expect(html).toMatch(/>\s*RevelaCash\s*</);
  });

  it('o logo é PNG e aponta para o domínio público', () => {
    // WebP não abre no Outlook, e APP_URL em homologação é localhost — que
    // nunca carregaria numa caixa de entrada.
    expect(LOGO).toMatch(/^https:\/\/www\.revelacash\.com\.br\/.*\.png$/);
    expect(html).toContain(LOGO);
  });

  it('o logo tem alt vazio — é decoração, não informação', () => {
    expect(html).toMatch(/<img[^>]+alt=""/);
  });

  it('leva o link em texto, para quem o botão não funciona', () => {
    expect(html).toContain('Se o botão não abrir');
  });

  it('é montado com tabela, não com flexbox nem grid', () => {
    // O Outlook desktop desenha com o motor do Word: layout moderno vira sopa.
    expect(html).toContain('<table');
    expect(html).not.toContain('display:flex');
    expect(html).not.toContain('display:grid');
  });
});

describe('o rodapé explica a ausência de conteúdo', () => {
  it('diz que o aviso não traz a conversa', () => {
    // Sem esta linha, a pessoa acha que o e-mail veio truncado. Com ela, a
    // decisão de privacidade vira motivo de confiança.
    expect(montarAviso(BASE).html).toContain('não traz o conteúdo da conversa');
    expect(montarAviso(BASE).texto).toContain('não traz o conteúdo da conversa');
  });

  it('muda a razão do envio conforme quem recebe', () => {
    const cliente = montarAviso({ ...BASE, paraOperador: false }).html;
    const operador = montarAviso({ ...BASE, paraOperador: true }).html;

    expect(cliente).toContain('tem um chamado aberto');
    expect(operador).toContain('cuida do suporte');
  });
});

describe('escapar', () => {
  it('neutraliza marcação', () => {
    expect(escapar('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapa aspas — os valores entram dentro de atributo', () => {
    expect(escapar('a" onload="x')).toBe('a&quot; onload=&quot;x');
  });

  it('escapa o & antes do resto, sem dupla codificação errada', () => {
    expect(escapar('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });

  it('aguenta null e undefined', () => {
    expect(escapar(null)).toBe('');
    expect(escapar(undefined)).toBe('');
  });

  it('o nome de quem recebeu o encaminhamento passa pelo escape', () => {
    // O nome vem da coleção `operadores`, escrita pelo script do operador —
    // não é entrada de cliente, mas o template não tem como saber disso.
    const html = montarAviso({
      ...BASE, titulo: 'Encaminhado para <img src=x onerror=alert(1)>.',
    }).html;

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});
