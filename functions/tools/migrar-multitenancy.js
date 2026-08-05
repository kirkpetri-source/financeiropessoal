#!/usr/bin/env node
/**
 * Migração para multi-tenancy: transforma os dados existentes (um usuário só)
 * na família #1 do sistema.
 *
 *   node tools/migrar-multitenancy.js              # simulação
 *   node tools/migrar-multitenancy.js --confirmar  # aplica
 *
 * O que faz, por usuário existente:
 *   1. cria households/{id} com ele como dono e o cadastra em members/
 *   2. carimba householdId em transactions, categories, paymentMethods e whatsappLogs
 *   3. move whatsappConfigs/{userId} para whatsappConfigs/{householdId}
 *   4. converte os "payers" da config em membros da família
 *   5. grava users/{uid}.householdId
 *
 * Idempotente: rodar de novo não duplica nem sobrescreve o que já migrou.
 * Faça o backup antes (npm run backup) — este script altera dados reais.
 */

const { admin, db } = require('../src/config/firebaseAdmin');
const householdService = require('../src/services/householdService');

const simulacao = !process.argv.includes('--confirmar');
const LOTE = 400;

function log(...args) { console.log(...args); }

async function carimbarColecao(colecao, householdId, filtro) {
  const snap = await db.collection(colecao).get();

  const alvos = snap.docs.filter((d) => {
    const dados = d.data();
    if (dados.householdId) return false;          // já migrado
    return filtro(dados);
  });

  if (!alvos.length) {
    log(`  ${colecao}: nada a migrar`);
    return 0;
  }

  if (!simulacao) {
    for (let i = 0; i < alvos.length; i += LOTE) {
      const lote = db.batch();
      alvos.slice(i, i + LOTE).forEach((d) => lote.update(d.ref, { householdId }));
      await lote.commit();
    }
  }

  log(`  ${colecao}: ${alvos.length} documento(s)`);
  return alvos.length;
}

async function migrarConfigWhatsapp(userId, householdId) {
  const antigo = await db.collection('whatsappConfigs').doc(userId).get();

  if (!antigo.exists) {
    log('  whatsappConfigs: nenhuma config para migrar');
    return null;
  }
  if (userId === householdId) {
    log('  whatsappConfigs: ID já coincide, nada a mover');
    return antigo.data();
  }

  const jaMigrado = await db.collection('whatsappConfigs').doc(householdId).get();
  if (jaMigrado.exists) {
    log('  whatsappConfigs: já existe no novo ID');
    return jaMigrado.data();
  }

  const dados = antigo.data();

  if (!simulacao) {
    await db.collection('whatsappConfigs').doc(householdId).set({
      ...dados,
      householdId,
      migradoDe: userId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // O documento antigo é apagado para não sobrar duas configs ativas com o
    // mesmo groupId — o webhook acharia a família errada.
    await db.collection('whatsappConfigs').doc(userId).delete();
  }

  log(`  whatsappConfigs: ${userId} -> ${householdId}`);
  return dados;
}

/** Os "payers" da config viram membros de verdade da família. */
async function migrarPagadores(householdId, config, ownerId) {
  const pagadores = config?.payers || [];
  if (!pagadores.length) {
    log('  membros: nenhum pagador cadastrado na config');
    return;
  }

  const membrosAtuais = simulacao ? [] : await householdService.listarMembros(householdId);
  const nomesExistentes = new Set(membrosAtuais.map((m) => String(m.name || '').toLowerCase()));

  for (const p of pagadores) {
    const nome = typeof p === 'string' ? p : p?.name;
    const telefone = typeof p === 'string' ? null : (p?.phone || null);
    if (!nome) continue;

    if (nomesExistentes.has(nome.toLowerCase())) {
      log(`  membros: "${nome}" já existe`);
      continue;
    }

    if (!simulacao) {
      const membros = await householdService.listarMembros(householdId);
      const dono = membros.find((m) => m.userId === ownerId);

      // Compara pelo PRIMEIRO nome: o dono vem do Firebase Auth com nome
      // completo ("Kirk Douglas") e o pagador da config com o apelido usado no
      // WhatsApp ("Kirk"). Exigir igualdade exata criava dois membros para a
      // mesma pessoa, e o gráfico de gastos por pessoa passava a mostrar as
      // duas metades separadas.
      const primeiroNome = (s) => String(s || '').trim().split(/\s+/)[0].toLowerCase();

      if (dono && primeiroNome(dono.name) === primeiroNome(nome)) {
        // O dono já é membro; só completa o telefone dele.
        await db.collection('households').doc(householdId)
          .collection('members').doc(ownerId).update({ phone: telefone });
        log(`  membros: telefone de "${nome}" (dono) preenchido`);
        continue;
      }

      // Membro sem conta ainda: entra com ID sintético para já ser reconhecido
      // pelo telefone no WhatsApp. Quando essa pessoa criar login, o convite
      // liga a conta real a este registro.
      const idSintetico = `pendente-${nome.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      await db.collection('households').doc(householdId)
        .collection('members').doc(idSintetico).set({
          userId: idSintetico,
          name: nome,
          phone: telefone,
          email: null,
          role: householdService.PAPEIS.MEMBRO,
          pendenteDeConta: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    log(`  membros: "${nome}"${telefone ? ` (${telefone})` : ''}`);
  }
}

async function main() {
  log(simulacao
    ? 'MODO SIMULAÇÃO — nada será gravado. Use --confirmar para aplicar.\n'
    : 'APLICANDO MIGRAÇÃO\n');

  const usuarios = await db.collection('users').get();
  if (usuarios.empty) {
    log('Nenhum usuário encontrado. Nada a fazer.');
    process.exit(0);
  }

  for (const userDoc of usuarios.docs) {
    const userId = userDoc.id;
    const usuario = userDoc.data();

    log(`\nUsuário ${usuario.email || userId}`);

    let householdId = usuario.householdId;

    if (householdId) {
      log(`  família: já existe (${householdId})`);
    } else if (simulacao) {
      householdId = '<novo-household>';
      log('  família: seria criada agora');
    } else {
      const familia = await householdService.criarHousehold({
        nome: usuario.name ? `Família ${String(usuario.name).split(' ')[0]}` : 'Minha família',
        ownerId: userId,
        ownerNome: usuario.name,
        ownerEmail: usuario.email,
      });
      householdId = familia.id;
      log(`  família: criada (${householdId})`);
    }

    // Na simulação não dá para carimbar com um ID que ainda não existe; o
    // filtro por userId mostra o volume que seria migrado.
    const idParaCarimbar = simulacao ? '<novo-household>' : householdId;

    await carimbarColecao('transactions', idParaCarimbar, (d) => d.userId === userId);
    await carimbarColecao('categories', idParaCarimbar, (d) => d.userId === userId && !d.isDefault);
    await carimbarColecao('paymentMethods', idParaCarimbar, (d) => d.userId === userId && !d.isDefault);
    await carimbarColecao('whatsappLogs', idParaCarimbar, (d) => d.userId === userId);

    const config = await migrarConfigWhatsapp(userId, householdId);
    await migrarPagadores(householdId, config, userId);
  }

  log(simulacao
    ? '\nSimulação concluída. Rode com --confirmar para aplicar.'
    : '\nMigração concluída.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFalha na migração:', err);
  process.exit(1);
});
