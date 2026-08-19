/**
 * Diagnóstico SOMENTE LEITURA: contas de login que não conseguem abrir o
 * painel porque `users/{uid}.householdId` está vazio.
 *
 * O atalho `users/{uid}.householdId` não é autorização — quem manda é o
 * documento em `households/{id}/members/{uid}` (ver modelo de dados). Mas é
 * ele que o painel usa para saber QUAL família abrir, então sem ele a pessoa
 * entra e vê "sem família", mesmo sendo dona de uma.
 *
 * Foi o que aconteceu com a conta de teste `liontech.sup@gmail.com`: funciona
 * pelo WhatsApp (onde a chave é o telefone) e não abre o painel.
 *
 * Não escreve nada. Pode rodar em produção à vontade.
 */

const { carregar } = require('./carregarAmbiente');
carregar();

const { admin, db } = require('../src/config/firebaseAdmin');

(async () => {
  const users = await db.collection('users').get();
  console.log(`\nContas de login em users/: ${users.size}\n`);

  const orfas = [];

  for (const doc of users.docs) {
    const d = doc.data();
    if (d.householdId) continue;

    // Sem householdId: procura em qual família esta pessoa é membro. É a
    // resposta que conserta o problema — e ela pode ser "nenhuma".
    const familias = [];
    const todas = await db.collection('households').get();
    for (const fam of todas.docs) {
      const membro = await fam.ref.collection('members').doc(doc.id).get();
      if (membro.exists) {
        familias.push({
          id: fam.id,
          nome: fam.data().name || '(sem nome)',
          papel: membro.data().role,
        });
      }
    }

    orfas.push({ uid: doc.id, email: d.email || '(sem email)', familias });
  }

  if (!orfas.length) {
    console.log('Nenhuma conta sem householdId. Todas abrem o painel.\n');
    process.exit(0);
  }

  console.log(`Contas SEM householdId: ${orfas.length}\n`);

  for (const o of orfas) {
    console.log(`--- ${o.email}`);
    console.log(`    uid: ${o.uid}`);
    if (!o.familias.length) {
      console.log('    é membro de: NENHUMA família — não há o que apontar.');
      console.log('    (conta de login criada sem família, ou família já apagada)');
    } else {
      for (const f of o.familias) {
        console.log(`    é membro de: ${f.nome} (${f.id}) como ${f.papel}`);
      }
      console.log('    -> dá para consertar apontando o householdId para essa família.');
    }
    console.log('');
  }

  console.log('Conserto (uma conta por vez, com o uid e a família conferidos acima):');
  console.log('  node tools/corrigir-conta-sem-familia.js <uid> <householdId> --confirmar\n');

  process.exit(0);
})().catch((err) => {
  console.error('Falhou:', err.message);
  process.exit(1);
});
