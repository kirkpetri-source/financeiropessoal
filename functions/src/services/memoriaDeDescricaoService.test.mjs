import { describe, it, expect, beforeEach } from 'vitest';
import { criarEscopo } from '../data/escopo.js';
import memoria from './memoriaDeDescricaoService.js';

const { criarMemoriaDeDescricao, chaveDe } = memoria;

const estado = { documentos: {} };

const fakeDb = {
  collection(nome) {
    return {
      doc(id) {
        return {
          id,
          async get() {
            const dados = estado.documentos[`${nome}/${id}`];
            return { exists: !!dados, id, data: () => dados };
          },
          async create(dados) {
            if (estado.documentos[`${nome}/${id}`]) {
              throw Object.assign(new Error('already exists'), { code: 6 });
            }
            estado.documentos[`${nome}/${id}`] = dados;
          },
          async update(dados) { Object.assign(estado.documentos[`${nome}/${id}`], dados); },
        };
      },
    };
  },
};

const fakeAdmin = { firestore: { FieldValue: { serverTimestamp: () => '<agora>' } } };
const escopoDe = criarEscopo(fakeDb, fakeAdmin);
const svc = criarMemoriaDeDescricao({ escopoDe, admin: fakeAdmin });

const FAMILIA = 'fam-1';
const OUTRA = 'fam-2';
const PET = 'ração cachorro';
const MERCADO = 'cat-mercado';
const PADARIA = 'sub-padaria';

function documentos() {
  return Object.entries(estado.documentos)
    .filter(([chave]) => chave.startsWith('memoriaDeDescricao/'))
    .map(([chave, dados]) => ({ id: chave.slice('memoriaDeDescricao/'.length), ...dados }));
}

beforeEach(() => {
  estado.documentos = {};
});

describe('chaveDe', () => {
  it('ignora acento e caixa — é a mesma despesa escrita de dois jeitos', () => {
    expect(chaveDe('Ração Cachorro')).toBe(chaveDe('racao cachorro'));
  });

  it('descarta pontuação e espaço sobrando', () => {
    expect(chaveDe('  Ração,  do   cachorro! ')).toBe('racao_do_cachorro');
  });

  it('nunca devolve barra, que o Firestore recusa em id de documento', () => {
    expect(chaveDe('uber / 99')).not.toContain('/');
  });

  it('trunca descrição comprida — a chave vira parte do id do documento', () => {
    expect(chaveDe('a'.repeat(500)).length).toBeLessThanOrEqual(120);
  });

  it('devolve vazio quando não sobra nada de texto', () => {
    expect(chaveDe('!!!')).toBe('');
    expect(chaveDe('')).toBe('');
    expect(chaveDe(null)).toBe('');
  });

  it('separa descrições parecidas de propósito — casar por semelhança erraria caro', () => {
    // Juntar "ração cachorro" com "ração do cachorro" parece esperto até o
    // dinheiro aparecer na categoria errada sem ninguém perceber.
    expect(chaveDe('ração cachorro')).not.toBe(chaveDe('ração do cachorro'));
  });
});

describe('consultar', () => {
  it('devolve null para descrição que a família nunca usou', async () => {
    expect(await svc.consultar(FAMILIA, PET)).toBeNull();
  });

  it('devolve null para descrição vazia, sem tocar o banco', async () => {
    expect(await svc.consultar(FAMILIA, '   ')).toBeNull();
    expect(documentos()).toHaveLength(0);
  });

  it('acha a memória mesmo escrita com outra caixa e outro acento', async () => {
    await svc.registrarAparicao(FAMILIA, 'Ração Cachorro', MERCADO);

    const achado = await svc.consultar(FAMILIA, 'racao cachorro');

    expect(achado.vezes).toBe(1);
    expect(achado.categoryId).toBe(MERCADO);
  });

  it('não enxerga o que outra família ensinou', async () => {
    await svc.aprender(OUTRA, PET, { subcategoryId: PADARIA, categoryId: MERCADO });

    expect(await svc.consultar(FAMILIA, PET)).toBeNull();
    expect(await svc.consultar(OUTRA, PET)).toMatchObject({ subcategoryId: PADARIA });
  });
});

describe('registrarAparicao', () => {
  it('conta a primeira aparição', async () => {
    expect(await svc.registrarAparicao(FAMILIA, PET, MERCADO)).toBe(1);
    expect(documentos()).toHaveLength(1);
  });

  it('a segunda aparição é o gatilho da oferta', async () => {
    await svc.registrarAparicao(FAMILIA, PET, MERCADO);

    expect(await svc.registrarAparicao(FAMILIA, PET, MERCADO)).toBe(2);
    expect(documentos()).toHaveLength(1);
  });

  it('não conta nem grava descrição vazia', async () => {
    expect(await svc.registrarAparicao(FAMILIA, '!!!', MERCADO)).toBe(0);
    expect(documentos()).toHaveLength(0);
  });

  it('mantém a categoria já conhecida quando a nova aparição vem sem ela', async () => {
    await svc.registrarAparicao(FAMILIA, PET, MERCADO);
    await svc.registrarAparicao(FAMILIA, PET, null);

    expect((await svc.consultar(FAMILIA, PET)).categoryId).toBe(MERCADO);
  });

  it('guarda a descrição mais recente — é como a pessoa escreve hoje', async () => {
    await svc.registrarAparicao(FAMILIA, 'Ração Cachorro', MERCADO);
    await svc.registrarAparicao(FAMILIA, 'racao cachorro', MERCADO);

    expect((await svc.consultar(FAMILIA, PET)).descricao).toBe('racao cachorro');
  });

  it('carimba a família no documento', async () => {
    await svc.registrarAparicao(FAMILIA, PET, MERCADO);
    expect(documentos()[0].householdId).toBe(FAMILIA);
  });
});

describe('aprender', () => {
  it('guarda o vínculo mesmo sem aparição registrada antes', async () => {
    await svc.aprender(FAMILIA, PET, { subcategoryId: PADARIA, categoryId: MERCADO });

    expect(await svc.consultar(FAMILIA, PET)).toMatchObject({
      subcategoryId: PADARIA,
      categoryId: MERCADO,
      vezes: 1,
    });
  });

  it('é o que faz o próximo lançamento ir direto para a subcategoria', async () => {
    await svc.registrarAparicao(FAMILIA, PET, MERCADO);
    await svc.registrarAparicao(FAMILIA, PET, MERCADO);
    await svc.aprender(FAMILIA, PET, { subcategoryId: PADARIA, categoryId: MERCADO });

    // O nome escolhido ("Pet") não precisa aparecer na frase seguinte: quem
    // resolve é a memória, não o casamento por texto.
    expect((await svc.consultar(FAMILIA, PET)).subcategoryId).toBe(PADARIA);
  });

  it('preserva quantas vezes a descrição já tinha aparecido', async () => {
    await svc.registrarAparicao(FAMILIA, PET, MERCADO);
    await svc.registrarAparicao(FAMILIA, PET, MERCADO);
    await svc.aprender(FAMILIA, PET, { subcategoryId: PADARIA, categoryId: MERCADO });

    expect((await svc.consultar(FAMILIA, PET)).vezes).toBe(2);
  });

  it('desfaz a recusa — quem aceita depois mudou de ideia', async () => {
    await svc.recusar(FAMILIA, PET);
    await svc.aprender(FAMILIA, PET, { subcategoryId: PADARIA, categoryId: MERCADO });

    expect(await svc.consultar(FAMILIA, PET)).toMatchObject({
      recusada: false,
      subcategoryId: PADARIA,
    });
  });
});

describe('recusar', () => {
  it('marca a recusa para nunca mais oferecer aquela descrição', async () => {
    await svc.registrarAparicao(FAMILIA, PET, MERCADO);
    await svc.registrarAparicao(FAMILIA, PET, MERCADO);
    await svc.recusar(FAMILIA, PET);

    expect(await svc.consultar(FAMILIA, PET)).toMatchObject({ recusada: true, vezes: 2 });
  });

  it('funciona na primeira oferta, quando ainda não havia registro', async () => {
    await svc.recusar(FAMILIA, PET);

    expect(await svc.consultar(FAMILIA, PET)).toMatchObject({
      recusada: true,
      subcategoryId: null,
    });
  });

  it('a recusa de uma família não cala a sugestão da outra', async () => {
    await svc.recusar(FAMILIA, PET);

    expect(await svc.consultar(OUTRA, PET)).toBeNull();
  });
});
