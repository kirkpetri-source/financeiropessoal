const { admin, db } = require('../config/firebaseAdmin');

// Versão dos termos aceita no cadastro. Mudou o contrato de forma relevante?
// Suba a data aqui — é o que permite saber depois quem aceitou o quê.
const TERMOS_VIGENTES = '2026-08-06';

const { normalizarCelular } = require('../utils/telefoneBR');

async function getProfile(userId) {
  const doc = await db.collection('users').doc(userId).get();
  if (!doc.exists) throw Object.assign(new Error('Usuário não encontrado.'), { statusCode: 404 });
  return { id: doc.id, ...doc.data() };
}

/**
 * Cria ou atualiza o perfil e garante que o usuário tenha uma família.
 *
 * Quem cadastra vira dono da própria família, com trial. Sem isso o usuário
 * novo logaria e esbarraria em SEM_HOUSEHOLD em toda tela — o cadastro precisa
 * entregar uma conta utilizável, não um estado intermediário.
 */
async function createOrUpdateProfile(userId, data) {
  const ref = db.collection('users').doc(userId);
  const doc = await ref.get();

  const payload = {
    name: data.name,
    email: data.email,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!doc.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();

    // Aceite dos termos, carimbado no cadastro. Num serviço pago, "o cliente
    // concordou" precisa de data e versão registradas — depois do fato não há
    // como reconstruir isso. Só no primeiro cadastro: atualizar o perfil não
    // reabre o aceite.
    if (data.aceitouTermos) {
      payload.termsAcceptedAt = admin.firestore.FieldValue.serverTimestamp();
      payload.termsVersion = TERMOS_VIGENTES;
    }

    await ref.set(payload);
  } else {
    await ref.update(payload);
  }

  const jaTemFamilia = doc.exists && doc.data().householdId;
  if (!jaTemFamilia) {
    // require local: householdService escreve em users/, e importar no topo
    // criaria dependência circular entre os dois services.
    const householdService = require('./householdService');
    await householdService.criarHousehold({
      nome: data.name ? `Família ${String(data.name).split(' ')[0]}` : 'Minha família',
      ownerId: userId,
      ownerNome: data.name,
      ownerEmail: data.email,
      // Telefone pedido já no cadastro. Sem ele, o dono entrava sem número e
      // os gastos dele ficavam sem atribuição até alguém perceber e editar.
      ownerTelefone: normalizarCelular(data.telefone),
    });
  }

  return getProfile(userId);
}

async function updateProfile(userId, name, email) {
  return createOrUpdateProfile(userId, { name, email });
}

// A troca de senha NÃO passa mais pelo backend.
//
// O Admin SDK não sabe conferir a senha atual — ele simplesmente sobrescreve.
// O endpoint antigo recebia currentPassword e ignorava, então quem pegasse um
// token conseguia trocar a senha sem conhecer a anterior e tomar a conta.
//
// Agora o frontend reautentica com reauthenticateWithCredential() e chama
// updatePassword() do próprio Firebase Auth, que exige a senha atual de fato.
// Ver frontend/src/contexts/AuthContext.jsx.

module.exports = { getProfile, createOrUpdateProfile, updateProfile, TERMOS_VIGENTES };
