const { admin, db } = require('../config/firebaseAdmin');
const { escopoDe } = require('../data/escopo');
const householdService = require('./householdService');
const { getConfig } = require('./whatsappConfigService');

/**
 * LGPD — portabilidade (art. 18, V) e eliminação (art. 18, VI).
 *
 * Duas decisões que definem o comportamento aqui:
 *
 * 1. **Exportação sai completa, mas sem segredo.** O cliente tem direito aos
 *    dados dele; não tem direito à chave da Evolution API gravada na
 *    configuração, que é credencial de infraestrutura e vazaria num JSON que
 *    ele vai mandar por e-mail para si mesmo.
 *
 * 2. **Exclusão tem prazo de arrependimento de 7 dias.** Um clique errado
 *    apagaria anos de histórico financeiro de uma família inteira, e não existe
 *    "desfazer" no Firestore. Durante a espera a conta fica congelada (não
 *    lança), o cliente consegue exportar e consegue cancelar. A LGPD não exige
 *    eliminação instantânea — exige que aconteça, em prazo razoável.
 */

const DIAS_ATE_APAGAR = 7;

// Campos da configuração do WhatsApp que são credencial, não dado pessoal.
const SEGREDOS_DA_CONFIG = new Set(['apiKey', 'cloudApiToken', 'cloudApiPhoneNumberId']);

function paraJson(valor) {
  if (valor == null) return valor;
  if (typeof valor.toDate === 'function') return valor.toDate().toISOString();
  if (Array.isArray(valor)) return valor.map(paraJson);
  if (typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, paraJson(v)]));
  }
  return valor;
}

async function despejar(query) {
  const snap = await query.get();
  return snap.docs.map((d) => paraJson({ id: d.id, ...d.data() }));
}

/**
 * Tudo que o sistema guarda sobre a família, em JSON.
 * Formato legível por humano e por planilha — é o que "portabilidade" quer
 * dizer na prática, não um dump interno do banco.
 */
async function exportarDados(householdId, solicitadoPor) {
  const dados = escopoDe(householdId);

  const [familia, membros, transacoes, categorias, formas, logs, config, orcamentos, contasFixas, faturas] = await Promise.all([
    householdService.buscarHousehold(householdId),
    householdService.listarMembros(householdId),
    despejar(dados.consultar('transactions')),
    despejar(dados.consultar('categories')),
    despejar(dados.consultar('paymentMethods')),
    despejar(dados.consultar('whatsappLogs')),
    getConfig(householdId),
    despejar(dados.consultar('budgets')),
    despejar(dados.consultar('recurringBills')),
    despejar(dados.consultar('creditCardInvoices')),
  ]);

  const configLimpa = Object.fromEntries(
    Object.entries(config).filter(([k]) => !SEGREDOS_DA_CONFIG.has(k))
  );

  const { codigoVinculo: _codigo, ...familiaSemSegredo } = paraJson(familia);

  return {
    exportadoEm: new Date().toISOString(),
    solicitadoPor,
    aviso: 'Arquivo com dados financeiros da sua família. Guarde em local seguro.',
    familia: familiaSemSegredo,
    membros: paraJson(membros),
    lancamentos: transacoes,
    categoriasPersonalizadas: categorias,
    formasDePagamentoPersonalizadas: formas,
    mensagensDoWhatsapp: logs,
    orcamentos,
    contasFixasRecorrentes: contasFixas,
    faturasDeCartao: faturas,
    configuracaoDoCanal: paraJson(configLimpa),
    totais: {
      lancamentos: transacoes.length,
      mensagens: logs.length,
      membros: membros.length,
    },
  };
}

/**
 * Marca a família para exclusão. Não apaga nada agora: congela e agenda.
 * Só o dono pode pedir — é o histórico da família inteira que vai embora.
 */
async function solicitarExclusao(householdId, { solicitadoPor, motivo = null }) {
  const apagarEm = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + DIAS_ATE_APAGAR * 24 * 60 * 60 * 1000)
  );

  await db.collection('households').doc(householdId).update({
    deletion: {
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      requestedBy: solicitadoPor,
      scheduledFor: apagarEm,
      reason: motivo,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { agendadaPara: apagarEm.toDate().toISOString(), diasParaCancelar: DIAS_ATE_APAGAR };
}

async function cancelarExclusao(householdId) {
  await db.collection('households').doc(householdId).update({
    deletion: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { cancelada: true };
}

/**
 * Apaga de verdade. Chamado pelo agendador quando o prazo vence, nunca direto
 * por uma rota HTTP.
 *
 * O que sai: lançamentos, logs, categorias e formas de pagamento da família,
 * configuração do canal, membros, o documento da família e o atalho
 * `users/{uid}.householdId` de cada membro.
 *
 * O que fica: a conta de login no Firebase Auth. Apagar login de outra pessoa
 * porque o dono da família pediu seria apagar dado de terceiro. Cada um exclui
 * o próprio acesso.
 */
async function apagarHousehold(householdId) {
  const dados = escopoDe(householdId);
  const contagem = {};

  for (const colecao of [
    'transactions', 'whatsappLogs', 'categories', 'paymentMethods',
    'budgets', 'recurringBills', 'creditCardInvoices',
  ]) {
    contagem[colecao] = await apagarEmLote(dados.consultar(colecao));
  }

  const membros = await householdService.listarMembros(householdId);
  const lote = db.batch();

  for (const membro of membros) {
    lote.delete(db.collection('households').doc(householdId).collection('members').doc(membro.id));
    lote.set(
      db.collection('users').doc(membro.id),
      {
        householdId: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  lote.delete(db.collection('whatsappConfigs').doc(householdId));
  lote.delete(db.collection('households').doc(householdId));
  await lote.commit();

  contagem.membros = membros.length;

  // Registro de que a exclusão aconteceu, sem nenhum dado pessoal dentro.
  // Serve para provar cumprimento da LGPD sem guardar o que foi eliminado.
  await db.collection('deletionAudit').add({
    householdId,
    executadaEm: admin.firestore.FieldValue.serverTimestamp(),
    contagem,
  });

  return contagem;
}

/** Firestore não tem "delete where". Vai em lotes de 400 (o teto do batch é 500). */
async function apagarEmLote(query, tamanho = 400) {
  let total = 0;

  for (;;) {
    const snap = await query.limit(tamanho).get();
    if (snap.empty) return total;

    const lote = db.batch();
    snap.docs.forEach((d) => lote.delete(d.ref));
    await lote.commit();

    total += snap.size;
    if (snap.size < tamanho) return total;
  }
}

/** Famílias cujo prazo de arrependimento já venceu. */
async function familiasParaApagar(agora = new Date()) {
  const snap = await db.collection('households')
    .where('deletion.scheduledFor', '<=', admin.firestore.Timestamp.fromDate(agora))
    .limit(50)
    .get();
  return snap.docs.map((d) => d.id);
}

/**
 * Saída individual: o membro sai da família e some do cadastro dela.
 * Os lançamentos que ele criou continuam — o histórico financeiro é da família,
 * e apagar metade dos gastos do mês porque alguém saiu quebraria o extrato de
 * quem ficou.
 */
async function sairDaFamilia(householdId, userId) {
  const familia = await householdService.buscarHousehold(householdId);

  if (familia.ownerId === userId) {
    throw Object.assign(
      new Error('O dono não sai da família: ou transfere a titularidade, ou exclui a conta.'),
      { statusCode: 400, codigo: 'DONO_NAO_SAI' }
    );
  }

  await householdService.removerMembro(householdId, userId);
  return { saiu: true };
}

module.exports = {
  DIAS_ATE_APAGAR,
  exportarDados,
  solicitarExclusao,
  cancelarExclusao,
  apagarHousehold,
  apagarEmLote,
  familiasParaApagar,
  sairDaFamilia,
};
