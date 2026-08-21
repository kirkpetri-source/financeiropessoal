import { describe, it, expect } from 'vitest';
import { detectarTipo, extensaoDeclarada, MIMES_ACEITOS } from './tipoDeArquivo.js';

/** Cabeçalhos reais, seguidos de lixo — é assim que um arquivo de verdade começa. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('IHDR resto do arquivo'),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('JFIF...')]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n');

describe('detectarTipo — o que é aceito', () => {
  it('reconhece PNG', () => {
    expect(detectarTipo(PNG)).toEqual({ mime: 'image/png', extensao: 'png' });
  });

  it('reconhece JPEG', () => {
    expect(detectarTipo(JPEG)).toEqual({ mime: 'image/jpeg', extensao: 'jpg' });
  });

  it('reconhece PDF', () => {
    expect(detectarTipo(PDF)).toEqual({ mime: 'application/pdf', extensao: 'pdf' });
  });

  it('só aceita esses três', () => {
    expect(MIMES_ACEITOS).toEqual(['image/png', 'image/jpeg', 'application/pdf']);
  });
});

describe('detectarTipo — o que é recusado', () => {
  it('recusa executável do Windows', () => {
    expect(detectarTipo(Buffer.from('MZ\x90\x00programa'))).toBeNull();
  });

  it('recusa ZIP (e portanto docx, xlsx, apk)', () => {
    expect(detectarTipo(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBeNull();
  });

  it('recusa SVG — é XML e executa script no navegador', () => {
    expect(detectarTipo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
  });

  it('recusa HTML', () => {
    expect(detectarTipo(Buffer.from('<!DOCTYPE html><script>'))).toBeNull();
  });

  it('recusa buffer vazio', () => {
    expect(detectarTipo(Buffer.alloc(0))).toBeNull();
  });

  it('recusa arquivo menor que a própria assinatura', () => {
    expect(detectarTipo(Buffer.from([0x89, 0x50]))).toBeNull();
  });

  it('recusa o que não é Buffer', () => {
    expect(detectarTipo('%PDF-1.7')).toBeNull();
    expect(detectarTipo(null)).toBeNull();
    expect(detectarTipo(undefined)).toBeNull();
  });
});

describe('detectarTipo — a fraude que isto existe para pegar', () => {
  it('conteúdo de PDF não vira PNG por causa do nome', () => {
    // O cliente manda "extrato.png" com um PDF dentro. O nome não entra na
    // conta em lugar nenhum: quem responde é o conteúdo.
    expect(detectarTipo(PDF).mime).toBe('application/pdf');
  });

  it('assinatura no meio do arquivo não conta, só no começo', () => {
    const disfarcado = Buffer.concat([Buffer.from('MZ executável'), PNG]);
    expect(detectarTipo(disfarcado)).toBeNull();
  });

  it('um byte errado na assinatura já derruba', () => {
    const quaseP = Buffer.from([0x89, 0x50, 0x4e, 0x46, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectarTipo(quaseP)).toBeNull();
  });
});

describe('extensaoDeclarada', () => {
  it('lê a extensão do nome, em minúscula', () => {
    expect(extensaoDeclarada('Extrato Agosto.PDF')).toBe('pdf');
    expect(extensaoDeclarada('print.png')).toBe('png');
  });

  it('devolve null quando não há extensão', () => {
    expect(extensaoDeclarada('arquivo')).toBeNull();
    expect(extensaoDeclarada('')).toBeNull();
    expect(extensaoDeclarada(null)).toBeNull();
  });

  it('pega a última extensão em nome com vários pontos', () => {
    expect(extensaoDeclarada('extrato.2026.08.pdf')).toBe('pdf');
  });
});
