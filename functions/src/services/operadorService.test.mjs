import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarDuble } from '../__testes__/dubleDeBanco.mjs';
import { criarOperadorService, COLECAO } from './operadorService.js';
import { PAPEIS, CAPACIDADES } from '../operadores/permissoes.js';

const AGORA = new Date('2026-08-22T10:00:00Z');
const KIRK = { uid: 'uid-kirk', papel: PAPEIS.ADMIN };

let duble;
let auth;
let operadores;

beforeEach(() => {
  duble = criarDuble({
    'operadores/uid-maria': {
      usuario: 'maria', nome: 'Maria', papel: PAPEIS.ATENDENTE, ativo: true, email: null,
    },
    'operadores/uid-kirk': {
      usuario: 'kirk', nome: 'Kirk', papel: PAPEIS.ADMIN, ativo: true,
    },
  });

  auth = {
    createUser: vi.fn(async ({ email }) => ({ uid: `uid-${email.split('@')[0]}` })),
    deleteUser: vi.fn(async () => {}),
    updateUser: vi.fn(async () => {}),
  };

  operadores = criarOperadorService({ db: duble.db, auth, agora: () => AGORA });
});

describe('criar', () => {
  it('cria o login com e-mail interno e o registro, com as permissões do papel', async () => {
    const novo = await operadores.criar({
      usuario: 'joao', nome: 'João', email: 'joao@empresa.com',
      papel: PAPEIS.SUPORTE_SENIOR, senha: 'senhaforte2026',
    }, KIRK);

    expect(auth.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'joao@operador.revelacash.internal',
    }));
    expect(novo.papel).toBe(PAPEIS.SUPORTE_SENIOR);
    expect(novo.permissoes).toContain(CAPACIDADES.ENCAMINHAR_CHAMADOS);
    expect(novo.permissoes).not.toContain(CAPACIDADES.VER_FINANCEIRO);
    expect(novo.ativo).toBe(true);
  });

  it('guarda o e-mail REAL, separado do login interno', async () => {
    const novo = await operadores.criar({
      usuario: 'joao', nome: 'João', email: 'joao@empresa.com',
      papel: PAPEIS.ATENDENTE, senha: 'senhaforte2026',
    }, KIRK);

    // Sem isso o aviso de encaminhamento ia para @operador.revelacash.internal,
    // uma caixa que não existe.
    expect(novo.email).toBe('joao@empresa.com');
    expect(novo.usuario).toBe('joao');
  });

  it('recusa senha curta — o painel vê dados de 13 famílias', async () => {
    await expect(operadores.criar({
      usuario: 'joao', papel: PAPEIS.ATENDENTE, senha: '123456',
    }, KIRK)).rejects.toMatchObject({ codigo: 'SENHA_FRACA' });

    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it('recusa usuário com formato inválido', async () => {
    await expect(operadores.criar({
      usuario: 'João Silva', papel: PAPEIS.ATENDENTE, senha: 'senhaforte2026',
    }, KIRK)).rejects.toMatchObject({ codigo: 'USUARIO_INVALIDO' });
  });

  it('recusa papel inventado', async () => {
    await expect(operadores.criar({
      usuario: 'joao', papel: 'DONO', senha: 'senhaforte2026',
    }, KIRK)).rejects.toMatchObject({ codigo: 'PAPEL_INVALIDO' });
  });

  it('usuário repetido vira 409, não erro cru do Firebase', async () => {
    auth.createUser = vi.fn(async () => {
      throw Object.assign(new Error('exists'), { code: 'auth/email-already-exists' });
    });

    await expect(operadores.criar({
      usuario: 'maria', papel: PAPEIS.ATENDENTE, senha: 'senhaforte2026',
    }, KIRK)).rejects.toMatchObject({ statusCode: 409, codigo: 'USUARIO_EM_USO' });
  });

  it('se o registro falhar, o login criado é APAGADO — nada de login órfão', async () => {
    const dbQuebrado = {
      collection: () => ({ doc: () => ({ set: async () => { throw new Error('firestore fora'); } }) }),
    };
    const comFalha = criarOperadorService({ db: dbQuebrado, auth, agora: () => AGORA });

    await expect(comFalha.criar({
      usuario: 'joao', papel: PAPEIS.ATENDENTE, senha: 'senhaforte2026',
    }, KIRK)).rejects.toThrow('firestore fora');

    expect(auth.deleteUser).toHaveBeenCalled();
  });
});

describe('atualizar', () => {
  it('muda o papel e as permissões acompanham', async () => {
    const r = await operadores.atualizar('uid-maria', { papel: PAPEIS.FINANCEIRO }, KIRK);

    expect(r.papel).toBe(PAPEIS.FINANCEIRO);
    expect(r.permissoes).toContain(CAPACIDADES.VER_FINANCEIRO);
    expect(duble.estado.documentos[`${COLECAO}/uid-maria`].papel).toBe(PAPEIS.FINANCEIRO);
  });

  it('desativar também desliga o login no Auth', async () => {
    await operadores.atualizar('uid-maria', { ativo: false }, KIRK);

    expect(duble.estado.documentos[`${COLECAO}/uid-maria`].ativo).toBe(false);
    expect(auth.updateUser).toHaveBeenCalledWith('uid-maria', { disabled: true });
  });

  it('permissão extra ACRESCENTA sem promover de papel', async () => {
    const r = await operadores.atualizar('uid-maria', {
      permissoesExtras: [CAPACIDADES.ENCAMINHAR_CHAMADOS],
    }, KIRK);

    expect(r.papel).toBe(PAPEIS.ATENDENTE);
    expect(r.permissoes).toContain(CAPACIDADES.ENCAMINHAR_CHAMADOS);
    expect(r.permissoes).not.toContain(CAPACIDADES.VER_FINANCEIRO);
  });

  it('recusa permissão que não existe', async () => {
    await expect(operadores.atualizar('uid-maria', {
      permissoesExtras: ['virarDono'],
    }, KIRK)).rejects.toMatchObject({ codigo: 'PERMISSAO_INVALIDA' });
  });

  it('NINGUÉM muda o próprio papel — um admin rebaixado tranca o painel', async () => {
    await expect(operadores.atualizar('uid-kirk', { papel: PAPEIS.ATENDENTE }, KIRK))
      .rejects.toMatchObject({ codigo: 'ALVO_E_VOCE_MESMO' });
  });

  it('NINGUÉM se autodesativa', async () => {
    await expect(operadores.atualizar('uid-kirk', { ativo: false }, KIRK))
      .rejects.toMatchObject({ codigo: 'ALVO_E_VOCE_MESMO' });
  });

  it('mudar só o nome NÃO apaga o e-mail (regra 10 — sem default em update)', async () => {
    duble.estado.documentos[`${COLECAO}/uid-maria`].email = 'maria@empresa.com';

    const r = await operadores.atualizar('uid-maria', { nome: 'Maria Silva' }, KIRK);

    expect(r.nome).toBe('Maria Silva');
    expect(r.email).toBe('maria@empresa.com');
  });

  it('404 em operador que não existe', async () => {
    await expect(operadores.atualizar('uid-fantasma', { nome: 'x' }, KIRK))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('redefinirSenha', () => {
  it('troca a senha no Auth', async () => {
    const r = await operadores.redefinirSenha('uid-maria', 'outrasenhaboa2026');

    expect(auth.updateUser).toHaveBeenCalledWith('uid-maria', { password: 'outrasenhaboa2026' });
    expect(r.trocada).toBe(true);
  });

  it('recusa senha curta', async () => {
    await expect(operadores.redefinirSenha('uid-maria', 'curta'))
      .rejects.toMatchObject({ codigo: 'SENHA_FRACA' });

    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

describe('listar', () => {
  it('ativos primeiro; a lista serve para operar, não para arquivo morto', async () => {
    await operadores.atualizar('uid-maria', { ativo: false }, KIRK);

    const lista = await operadores.listar();

    expect(lista[0].ativo).toBe(true);
    expect(lista.at(-1).usuario).toBe('maria');
  });

  it('não devolve o documento cru — campo novo não vaza para a tela sozinho', async () => {
    duble.estado.documentos[`${COLECAO}/uid-maria`].segredoInterno = 'nao pode sair';

    const [primeiro] = (await operadores.listar()).filter((o) => o.usuario === 'maria');

    expect(primeiro.segredoInterno).toBeUndefined();
  });
});
