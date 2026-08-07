const { admin, db } = require('../config/firebaseAdmin');
const { gerarCodigoVinculo } = require('../utils/codigoVinculo');
const { DIAS_DE_TRIAL } = require('../assinatura/estado');

/**
 * Famílias (households) — a unidade de cobrança e de isolamento do sistema.
 *
 * Modelo:
 *   households/{id}                  dados da família e da assinatura
 *   households/{id}/members/{userId} quem participa e com qual papel
 *   users/{uid}.householdId          família ativa do usuário
 *
 * Os membros ficam em subcoleção, e não num array dentro do documento, para
 * que convidar alguém não exija reescrever o documento inteiro (e para não
 * esbarrar no limite de 1MB por documento quando a família crescer).
 */

const PAPEIS = { DONO: 'owner', MEMBRO: 'member', LEITOR: 'viewer' };

// Quem pode fazer o quê. Verificado no middleware, não espalhado pelos services.
const PERMISSOES = {
  [PAPEIS.DONO]: { lancar: true, editarTudo: true, gerirMembros: true, gerirAssinatura: true, gerirCanal: true },
  [PAPEIS.MEMBRO]: { lancar: true, editarTudo: false, gerirMembros: false, gerirAssinatura: false, gerirCanal: false },
  [PAPEIS.LEITOR]: { lancar: false, editarTudo: false, gerirMembros: false, gerirAssinatura: false, gerirCanal: false },
};

function refMembros(householdId) {
  return db.collection('households').doc(householdId).collection('members');
}

async function criarHousehold({ nome, ownerId, ownerNome, ownerEmail, ownerTelefone = null }) {
  if (!ownerId) throw Object.assign(new Error('ownerId obrigatório.'), { statusCode: 400 });

  const agora = admin.firestore.FieldValue.serverTimestamp();
  const fimDoTrial = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + DIAS_DE_TRIAL * 24 * 60 * 60 * 1000)
  );

  const ref = db.collection('households').doc();

  await db.runTransaction(async (tx) => {
    tx.set(ref, {
      name: nome || `Família de ${ownerNome || 'você'}`,
      ownerId,
      // Codigo que o cliente manda no grupo ("vincular ABC123") para ligar o
      // grupo do WhatsApp a esta familia, sem precisar descobrir o ID do grupo.
      codigoVinculo: gerarCodigoVinculo(),
      subscription: {
        status: 'trialing',
        plan: 'familia',
        trialEndsAt: fimDoTrial,
        provider: null,
        externalId: null,
      },
      createdAt: agora,
      updatedAt: agora,
    });

    tx.set(ref.collection('members').doc(ownerId), {
      userId: ownerId,
      name: ownerNome || null,
      email: ownerEmail || null,
      phone: ownerTelefone,
      role: PAPEIS.DONO,
      createdAt: agora,
    });

    tx.set(db.collection('users').doc(ownerId), {
      householdId: ref.id,
      updatedAt: agora,
    }, { merge: true });
  });

  return buscarHousehold(ref.id);
}

async function buscarHousehold(householdId) {
  const doc = await db.collection('households').doc(householdId).get();
  if (!doc.exists) throw Object.assign(new Error('Família não encontrada.'), { statusCode: 404 });
  return { id: doc.id, ...doc.data() };
}

async function listarMembros(householdId) {
  const snap = await refMembros(householdId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Papel do usuário na família. Devolve null quando ele não participa —
 * é o que o middleware usa para barrar acesso.
 */
async function papelDoUsuario(householdId, userId) {
  if (!householdId || !userId) return null;
  const doc = await refMembros(householdId).doc(userId).get();
  return doc.exists ? doc.data().role : null;
}

function permissoesDoPapel(papel) {
  return PERMISSOES[papel] || PERMISSOES[PAPEIS.LEITOR];
}

async function adicionarMembro(householdId, { userId, nome, email, telefone = null, papel = PAPEIS.MEMBRO }) {
  if (!Object.values(PAPEIS).includes(papel)) {
    throw Object.assign(new Error('Papel inválido.'), { statusCode: 400 });
  }

  const jaExiste = await refMembros(householdId).doc(userId).get();
  if (jaExiste.exists) {
    throw Object.assign(new Error('Essa pessoa já faz parte da família.'), { statusCode: 409 });
  }

  await refMembros(householdId).doc(userId).set({
    userId,
    name: nome || null,
    email: email || null,
    phone: telefone,
    role: papel,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('users').doc(userId).set({
    householdId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return listarMembros(householdId);
}

async function atualizarMembro(householdId, userId, { nome, telefone, papel }) {
  const membro = await refMembros(householdId).doc(userId).get();
  if (!membro.exists) throw Object.assign(new Error('Membro não encontrado.'), { statusCode: 404 });

  const household = await buscarHousehold(householdId);

  // A família não pode ficar sem dono.
  if (papel && papel !== PAPEIS.DONO && household.ownerId === userId) {
    throw Object.assign(new Error('O dono da família não pode deixar de ser dono.'), { statusCode: 400 });
  }
  if (papel && !Object.values(PAPEIS).includes(papel)) {
    throw Object.assign(new Error('Papel inválido.'), { statusCode: 400 });
  }

  const dados = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (nome !== undefined) dados.name = nome;
  if (telefone !== undefined) dados.phone = telefone;
  if (papel !== undefined) dados.role = papel;

  await refMembros(householdId).doc(userId).update(dados);
  return listarMembros(householdId);
}

async function removerMembro(householdId, userId) {
  const household = await buscarHousehold(householdId);
  if (household.ownerId === userId) {
    throw Object.assign(new Error('O dono da família não pode ser removido.'), { statusCode: 400 });
  }

  const membro = await refMembros(householdId).doc(userId).get();
  if (!membro.exists) throw Object.assign(new Error('Membro não encontrado.'), { statusCode: 404 });

  await refMembros(householdId).doc(userId).delete();

  // Os lançamentos que a pessoa criou continuam na família — o histórico
  // financeiro é da família, não de quem digitou.
  await db.collection('users').doc(userId).set({
    householdId: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return listarMembros(householdId);
}

/**
 * Localiza a família a partir do telefone de um membro. Usado pelo canal de
 * WhatsApp para saber quem está mandando a mensagem.
 */
async function acharMembroPorTelefone(householdId, telefone) {
  if (!telefone) return null;
  const digitos = String(telefone).replace(/\D/g, '');
  if (!digitos) return null;

  const membros = await listarMembros(householdId);
  return membros.find((m) => {
    if (!m.phone) return false;
    const cadastrado = String(m.phone).replace(/\D/g, '');
    return cadastrado === digitos
      || cadastrado.endsWith(digitos)
      || digitos.endsWith(cadastrado);
  }) || null;
}

async function atualizarHousehold(householdId, { nome }) {
  const dados = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (nome !== undefined) dados.name = nome;
  await db.collection('households').doc(householdId).update(dados);
  return buscarHousehold(householdId);
}

/** A assinatura está em dia? Bloqueio de acesso na Fase 5 usa isso. */
function assinaturaAtiva(household) {
  const s = household?.subscription;
  if (!s) return false;
  if (s.status === 'active') return true;
  if (s.status === 'trialing') {
    const fim = s.trialEndsAt?.toDate?.() || s.trialEndsAt;
    return fim ? new Date(fim) > new Date() : false;
  }
  return false;
}

module.exports = {
  PAPEIS,
  DIAS_DE_TRIAL,
  criarHousehold,
  buscarHousehold,
  atualizarHousehold,
  listarMembros,
  papelDoUsuario,
  permissoesDoPapel,
  adicionarMembro,
  atualizarMembro,
  removerMembro,
  acharMembroPorTelefone,
  assinaturaAtiva,
};
