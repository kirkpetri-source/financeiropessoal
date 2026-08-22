/**
 * Gestão de operadores pela TELA — criar, editar papel, desativar.
 *
 * Antes disto só existia `tools/criar-login-operador.js`, um script com quatro
 * flags que o Kirk mesmo classificou como confuso. Um sistema que cobra
 * mensalidade não pode exigir terminal para contratar alguém do suporte.
 *
 * O que este serviço NÃO faz, de propósito:
 *
 * - Não guarda senha. Quem guarda é o Firebase Auth; aqui só se pede a criação
 *   e a redefinição. Senha em documento do Firestore seria um vazamento
 *   esperando acontecer.
 * - Não deixa ninguém mexer no próprio papel nem se autodesativar. Um admin
 *   que se rebaixa por engano tranca o painel inteiro, e não haveria caminho
 *   de volta pela tela.
 * - Não apaga operador. Desativa. O histórico de "quem atendeu o chamado #12"
 *   precisa continuar resolvendo um nome.
 */

const { PAPEIS, permissoesEfetivas, TODAS } = require('../operadores/permissoes');

const COLECAO = 'operadores';

/**
 * O login vira um e-mail interno porque o Firebase Auth exige formato de
 * e-mail. Ninguém lê essa caixa — o e-mail REAL da pessoa é outro campo, e é
 * para ele que vai o aviso de encaminhamento (antes disso o aviso caía num
 * endereço que não existe).
 */
const DOMINIO_INTERNO = 'operador.revelacash.internal';

const USUARIO_VALIDO = /^[a-z0-9_.-]{3,32}$/;

function erro(mensagem, statusCode, codigo) {
  return Object.assign(new Error(mensagem), { statusCode, codigo });
}

function emailInterno(usuario) {
  return `${usuario}@${DOMINIO_INTERNO}`;
}

/** Só o que a tela precisa. Nunca o documento cru: campo novo vazaria sozinho. */
function paraTela(uid, dados) {
  const papel = Object.values(PAPEIS).includes(dados.papel) ? dados.papel : PAPEIS.ATENDENTE;

  return {
    uid,
    usuario: dados.usuario || null,
    nome: dados.nome || null,
    email: dados.email || null,
    papel,
    ativo: dados.ativo === true,
    permissoesExtras: Array.isArray(dados.permissoesExtras) ? dados.permissoesExtras : [],
    permissoes: permissoesEfetivas(papel, dados.permissoesExtras),
    criadoEm: dados.criadoEm || null,
    ultimoAcessoEm: dados.ultimoAcessoEm || null,
  };
}

function criarOperadorService({ db, auth, agora = () => new Date() }) {
  async function listar() {
    const snap = await db.collection(COLECAO).get();

    return snap.docs
      .map((d) => paraTela(d.id, d.data()))
      // Ativos primeiro, depois por nome: quem foi desligado não deve ocupar o
      // topo de uma lista que existe para operar o dia a dia.
      .sort((a, b) => {
        if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
        return String(a.nome || a.usuario).localeCompare(String(b.nome || b.usuario), 'pt-BR');
      });
  }

  async function buscar(uid) {
    const doc = await db.collection(COLECAO).doc(uid).get();
    if (!doc.exists) throw erro('Operador não encontrado.', 404, 'OPERADOR_NAO_ENCONTRADO');
    return paraTela(doc.id, doc.data());
  }

  /**
   * Cria o login e o registro, nesta ordem.
   *
   * Se o registro falhar depois do login criado, o login é apagado: um login
   * órfão deixa o usuário "já em uso" e ninguém consegue criar de novo com o
   * mesmo nome — o mesmo cuidado que o cadastro de cliente já toma.
   */
  async function criar({ usuario, nome, email, papel, senha }, quemFez) {
    const login = String(usuario || '').trim().toLowerCase();

    if (!USUARIO_VALIDO.test(login)) {
      throw erro(
        'Usuário deve ter de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou _.',
        400, 'USUARIO_INVALIDO',
      );
    }
    if (!Object.values(PAPEIS).includes(papel)) {
      throw erro('Papel inválido.', 400, 'PAPEL_INVALIDO');
    }
    if (!senha || String(senha).length < 10) {
      throw erro('A senha do operador precisa de pelo menos 10 caracteres.', 400, 'SENHA_FRACA');
    }

    let usuarioAuth;
    try {
      usuarioAuth = await auth.createUser({
        email: emailInterno(login),
        password: senha,
        displayName: nome || login,
      });
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        throw erro(`O usuário "${login}" já existe.`, 409, 'USUARIO_EM_USO');
      }
      throw err;
    }

    try {
      const registro = {
        usuario: login,
        nome: nome || login,
        email: email || null,
        papel,
        ativo: true,
        permissoesExtras: [],
        criadoEm: agora().toISOString(),
        criadoPor: quemFez?.uid || null,
      };

      await db.collection(COLECAO).doc(usuarioAuth.uid).set(registro);
      return paraTela(usuarioAuth.uid, registro);
    } catch (err) {
      try { await auth.deleteUser(usuarioAuth.uid); } catch { /* já foi */ }
      throw err;
    }
  }

  /**
   * Muda papel, nome, e-mail, permissões extras e ativo/inativo.
   *
   * Sem `.default()` em nada (regra 10): campo ausente no corpo NÃO é
   * sobrescrito. Um formulário que manda só o papel não pode apagar o e-mail.
   */
  async function atualizar(uid, mudancas, quemFez) {
    if (uid === quemFez?.uid && (mudancas.papel !== undefined || mudancas.ativo !== undefined)) {
      // Um admin que se rebaixa ou se desativa por engano tranca o painel — e
      // não sobra caminho pela tela para desfazer.
      throw erro(
        'Você não pode mudar o próprio papel nem se desativar. Peça a outro administrador.',
        400, 'ALVO_E_VOCE_MESMO',
      );
    }

    const ref = db.collection(COLECAO).doc(uid);
    const doc = await ref.get();
    if (!doc.exists) throw erro('Operador não encontrado.', 404, 'OPERADOR_NAO_ENCONTRADO');

    const patch = {};

    if (mudancas.papel !== undefined) {
      if (!Object.values(PAPEIS).includes(mudancas.papel)) {
        throw erro('Papel inválido.', 400, 'PAPEL_INVALIDO');
      }
      patch.papel = mudancas.papel;
    }
    if (mudancas.nome !== undefined) patch.nome = String(mudancas.nome).trim() || null;
    if (mudancas.email !== undefined) patch.email = String(mudancas.email).trim() || null;
    if (mudancas.ativo !== undefined) patch.ativo = mudancas.ativo === true;

    if (mudancas.permissoesExtras !== undefined) {
      const extras = Array.isArray(mudancas.permissoesExtras) ? mudancas.permissoesExtras : [];
      const invalida = extras.find((p) => !TODAS.includes(p));
      if (invalida) throw erro(`Permissão desconhecida: ${invalida}.`, 400, 'PERMISSAO_INVALIDA');
      patch.permissoesExtras = extras;
    }

    if (!Object.keys(patch).length) return paraTela(uid, doc.data());

    patch.atualizadoEm = agora().toISOString();
    patch.atualizadoPor = quemFez?.uid || null;

    await ref.update(patch);

    // O login também é desligado no Auth: deixar só o `ativo: false` no
    // Firestore barra o painel, mas a credencial continua válida para
    // qualquer coisa que venha a olhar só o token.
    if (patch.ativo !== undefined) {
      try {
        await auth.updateUser(uid, { disabled: !patch.ativo });
      } catch (err) {
        console.warn(`[Operador] Não consegui ${patch.ativo ? 'reativar' : 'desativar'} o login ${uid}:`, err.message);
      }
    }

    return paraTela(uid, { ...doc.data(), ...patch });
  }

  /**
   * Define uma senha nova. Não confere a antiga porque quem chama é um ADMIN
   * redefinindo a senha de outra pessoa — o caso "esqueci minha senha" de um
   * operador que não tem e-mail real para receber link.
   */
  async function redefinirSenha(uid, novaSenha) {
    if (!novaSenha || String(novaSenha).length < 10) {
      throw erro('A senha precisa de pelo menos 10 caracteres.', 400, 'SENHA_FRACA');
    }

    const doc = await db.collection(COLECAO).doc(uid).get();
    if (!doc.exists) throw erro('Operador não encontrado.', 404, 'OPERADOR_NAO_ENCONTRADO');

    await auth.updateUser(uid, { password: novaSenha });
    return { uid, trocada: true };
  }

  /** Carimba o último acesso. Serve para saber quem está de fato trabalhando. */
  async function registrarAcesso(uid) {
    try {
      await db.collection(COLECAO).doc(uid).update({ ultimoAcessoEm: agora().toISOString() });
    } catch {
      // Nunca derruba a requisição: é telemetria, não autorização.
    }
  }

  return { listar, buscar, criar, atualizar, redefinirSenha, registrarAcesso };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { db, admin } = require('../config/firebaseAdmin');
    _padrao = criarOperadorService({ db, auth: admin.auth() });
  }
  return _padrao;
}

module.exports = {
  criarOperadorService,
  DOMINIO_INTERNO,
  COLECAO,
  listar: (...a) => servico().listar(...a),
  buscar: (...a) => servico().buscar(...a),
  criar: (...a) => servico().criar(...a),
  atualizar: (...a) => servico().atualizar(...a),
  redefinirSenha: (...a) => servico().redefinirSenha(...a),
  registrarAcesso: (...a) => servico().registrarAcesso(...a),
};
