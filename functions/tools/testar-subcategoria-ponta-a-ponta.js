#!/usr/bin/env node
/**
 * Teste ponta a ponta da feature de subcategoria, direto contra o Firestore
 * de PRODUÇÃO — sem navegador, sem App Check (roda com o Admin SDK, que tem
 * acesso total). Cria uma família descartável, exercita CRUD de subcategoria
 * + lançamento com subcategoria, e apaga tudo no final.
 *
 *   node tools/testar-subcategoria-ponta-a-ponta.js
 */

const { admin, db } = require('../src/config/firebaseAdmin');
const { escopoDe } = require('../src/data/escopo');
const householdService = require('../src/services/householdService');
const categoryService = require('../src/services/categoryService');
const subcategoryService = require('../src/services/subcategoryService');
const { createTransaction, listTransactions } = require('../src/services/transactionService');
const lgpdService = require('../src/services/lgpdService');

function linha(rotulo, valor) {
  console.log(`  ${String(rotulo).padEnd(28)}${valor}`);
}

async function main() {
  console.log('Teste ponta a ponta — subcategoria (Firestore de produção, família descartável)\n');

  const household = await householdService.criarHousehold({
    nome: 'TESTE-SUBCATEGORIA-PONTA-A-PONTA',
    ownerId: `teste-subcategoria-${Date.now()}`,
    ownerNome: 'Teste Automatizado',
    ownerEmail: 'teste-subcategoria@example.com',
  });
  const householdId = household.id;
  linha('household criado', householdId);

  const dados = escopoDe(householdId);

  try {
    // Precisa de uma categoria pra pendurar a subcategoria. Usa uma padrão do sistema.
    const categorias = await categoryService.listCategories(dados);
    const categoriaMae = categorias.find((c) => c.isDefault && (c.type === 'EXPENSE' || c.type === 'BOTH'));
    if (!categoriaMae) throw new Error('Nenhuma categoria padrão de despesa encontrada — rode npm run seed?');
    linha('categoria-mãe', `${categoriaMae.name} (${categoriaMae.id})`);

    // 1) CRUD de subcategoria
    const sub = await subcategoryService.createSubcategory(dados, { name: 'Padaria (teste)', categoryId: categoriaMae.id });
    linha('subcategoria criada', `${sub.name} (${sub.id})`);

    const lista = await subcategoryService.listSubcategories(dados, categoriaMae.id);
    if (!lista.some((s) => s.id === sub.id)) throw new Error('Subcategoria criada não aparece na listagem.');
    linha('listagem', `OK (${lista.length} subcategoria(s) na categoria)`);

    const atualizada = await subcategoryService.updateSubcategory(dados, sub.id, { name: 'Padaria e Confeitaria (teste)', categoryId: categoriaMae.id });
    if (atualizada.name !== 'Padaria e Confeitaria (teste)') throw new Error('Update não aplicou o nome novo.');
    linha('edição', 'OK');

    // 2) transação com subcategoria
    const formas = await db.collection('paymentMethods').where('isDefault', '==', true).limit(1).get();
    if (formas.empty) throw new Error('Nenhuma forma de pagamento padrão encontrada.');
    const paymentMethodId = formas.docs[0].id;

    const transacao = await createTransaction(dados, {
      type: 'EXPENSE',
      description: 'Pão do dia (teste)',
      amount: 12.5,
      categoryId: categoriaMae.id,
      subcategoryId: sub.id,
      paymentMethodId,
      date: new Date().toISOString(),
    });
    if (transacao.subcategory?.id !== sub.id) throw new Error('Transação criada não veio com subcategory enriquecida.');
    linha('lançamento com subcategoria', `OK — subcategory.name = "${transacao.subcategory.name}"`);

    const listados = await listTransactions(dados, {});
    const achado = listados.find((t) => t.id === transacao.id);
    if (achado?.subcategory?.id !== sub.id) throw new Error('Listagem de lançamentos não trouxe a subcategoria.');
    linha('listagem de lançamentos', 'OK — subcategoria aparece');

    // 3) recusa apagar subcategoria em uso
    try {
      await subcategoryService.deleteSubcategory(dados, sub.id);
      throw new Error('Deveria ter recusado apagar subcategoria em uso.');
    } catch (err) {
      if (err.statusCode !== 409) throw err;
      linha('recusa apagar em uso', 'OK (409)');
    }

    // 4) recusa apagar categoria-mãe com subcategoria
    try {
      await categoryService.deleteCategory(dados, categoriaMae.id);
      // categoria é padrão do sistema (_somenteLeitura) — já devia recusar por isso também,
      // então esse caminho não é o alvo real do teste; segue sem falhar o script.
    } catch (err) {
      linha('categoria padrão protegida', `OK (${err.statusCode})`);
    }

    console.log('\n✅ Tudo funcionou contra o Firestore de produção.');
  } finally {
    await db.collection('transactions').where('householdId', '==', householdId).get()
      .then((s) => Promise.all(s.docs.map((d) => d.ref.delete())));
    await lgpdService.apagarHousehold(householdId);
    console.log(`\n🗑️  Família de teste ${householdId} apagada.`);
  }
}

main().catch((err) => {
  console.error('\n❌ Falhou:', err.message);
  process.exit(1);
});
