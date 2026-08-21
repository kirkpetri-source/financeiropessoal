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
 * Chamados de suporte, prontos para o export.
 *
 * O binário do anexo NÃO vem aqui dentro. Um chamado com cinco anexos de 5 MB
 * viraria ~33 MB de base64 montados na memória de uma function de 256 MiB — e
 * quebraria. O que vai é o metadado mais o caminho da API que serve o arquivo;
 * a tela "Meus dados" usa esse caminho para baixar cada um, autenticada.
 *
 * Também não vai link assinado: ele venceria dentro do arquivo exportado, e um
 * link morto num JSON é pior que nenhum link, porque parece que funciona.
 */
function prepararChamados(chamados) {
  return chamados.map((chamado) => ({
    ...chamado,
    mensagens: (chamado.mensagens || []).map((mensagem) => ({
      ...mensagem,
      anexos: (mensagem.anexos || []).map((anexo) => ({
        nomeOriginal: anexo.nomeOriginal,
        mimeType: anexo.mimeType,
        tamanho: anexo.tamanho,
        enviadoEm: anexo.enviadoEm || null,
        baixarEm: `/suporte/chamados/${chamado.numero}/anexos/${anexo.id}`,
      })),
    })),
  }));
}

/**
 * Tudo que o sistema guarda sobre a família, em JSON.
 * Formato legível por humano e por planilha — é o que "portabilidade" quer
 * dizer na prática, não um dump interno do banco.
 */
async function exportarDados(householdId, solicitadoPor) {
  const dados = escopoDe(householdId);

  const [familia, membros, transacoes, categorias, subcategorias, formas, logs, config, orcamentos, contasFixas, faturas, importacoes, conversas, memoriaDeDescricao, chamados] = await Promise.all([
    householdService.buscarHousehold(householdId),
    householdService.listarMembros(householdId),
    despejar(dados.consultar('transactions')),
    despejar(dados.consultar('categories')),
    despejar(dados.consultar('subcategories')),
    despejar(dados.consultar('paymentMethods')),
    despejar(dados.consultar('whatsappLogs')),
    getConfig(householdId),
    despejar(dados.consultar('budgets')),
    despejar(dados.consultar('recurringBills')),
    despejar(dados.consultar('creditCardInvoices')),
    despejar(dados.consultar('importBatches')),
    despejar(dados.consultar('chatSessions')),
    despejar(dados.consultar('memoriaDeDescricao')),
    despejar(dados.consultar('supportTickets')),
  ]);

  const configLimpa = Object.fromEntries(
    Object.entries(config).filter(([k]) => !SEGREDOS_DA_CONFIG.has(k))
  );

  const { codigoVinculo: _codigo, ...familiaSemSegredo } = paraJson(familia);

  return {
    exportadoEm: new Date().toISOString(),
    solicitadoPor,
    aviso: 'Arquivo com dados financeiros da sua família. Guarde em local seguro.',
    // Dito em uma linha porque a alternativa é a pessoa procurar o anexo dentro
    // do JSON e concluir que o export veio incompleto.
    avisoSobreAnexos: chamados.length
      ? 'Os anexos dos chamados não vêm dentro deste arquivo. Baixe pelo botão '
        + '"Baixar anexos dos chamados", em Configurações > Meus dados, enquanto sua conta existir.'
      : undefined,
    familia: familiaSemSegredo,
    membros: paraJson(membros),
    lancamentos: transacoes,
    categoriasPersonalizadas: categorias,
    subcategorias,
    formasDePagamentoPersonalizadas: formas,
    mensagensDoWhatsapp: logs,
    orcamentos,
    contasFixasRecorrentes: contasFixas,
    faturasDeCartao: faturas,
    importacoesDeExtrato: importacoes,
    conversasComOConsultor: conversas,
    // O que o sistema aprendeu sobre como esta família descreve os gastos.
    memoriaDeDescricoes: memoriaDeDescricao,
    chamadosDeSuporte: prepararChamados(chamados),
    configuracaoDoCanal: paraJson(configLimpa),
    totais: {
      lancamentos: transacoes.length,
      mensagens: logs.length,
      membros: membros.length,
      chamadosDeSuporte: chamados.length,
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
 * chamados de suporte, os ARQUIVOS de anexo no Storage, configuração do canal,
 * membros, o documento da família e o atalho `users/{uid}.householdId` de cada
 * membro.
 *
 * O que fica: a conta de login no Firebase Auth. Apagar login de outra pessoa
 * porque o dono da família pediu seria apagar dado de terceiro. Cada um exclui
 * o próprio acesso.
 */
async function apagarHousehold(householdId) {
  const dados = escopoDe(householdId);
  const contagem = {};

  for (const colecao of [
    'transactions', 'whatsappLogs', 'categories', 'subcategories', 'paymentMethods',
    'budgets', 'recurringBills', 'creditCardInvoices', 'pendingSubcategoryConfirmations',
    'importBatches', 'importMemoria', 'chatSessions', 'memoriaDeDescricao',
    'supportTickets',
  ]) {
    contagem[colecao] = await apagarEmLote(dados.consultar(colecao));
  }

  contagem.anexosNoStorage = await apagarAnexosDaFamilia(householdId);

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

/**
 * Apaga a família AGORA, sem os 7 dias de arrependimento — caminho do
 * OPERADOR para limpar conta de teste (o cliente nunca aciona isto; ele só
 * tem `solicitarExclusao`, que agenda). Reaproveitado pelo painel
 * `/plataforma` e por `tools/apagar-familia.js` — mesma implementação, dois
 * pontos de entrada, para não haver duas versões da mesma exclusão irreversível.
 *
 * Faz o que `apagarHousehold` faz e mais: desliga a instância no servidor
 * Evolution (se houver) e remove do Firebase Auth os logins de quem só
 * participava desta família — quem participa de outra família mantém o
 * acesso, porque apagar o login de terceiro por causa desta família seria
 * apagar dado que não é dela.
 */
async function apagarFamiliaAgora(householdId, { provider = null, evolutionConfig = null } = {}) {
  const familia = await householdService.buscarHousehold(householdId);
  const membros = await householdService.listarMembros(householdId);
  const configCanal = await getConfig(householdId).catch(() => null);

  // Some junto com o resultado quando o WhatsApp pode não liberar o número na
  // hora — sem isso, o operador só descobre tentando conectar de novo e
  // recebendo "não foi possível conectar ao dispositivo" sem explicação.
  let avisoWhatsapp = null;

  if (provider && evolutionConfig && configCanal?.instanceName) {
    const instanceName = configCanal.instanceName;
    try {
      const estado = await provider.estadoDaConexao(evolutionConfig, instanceName);

      if (!estado.conectada) {
        // Sem sessão aberta não tem canal pra mandar o logout de verdade pro
        // WhatsApp — apagar aqui só limpa o registro local. O número pode
        // ficar temporariamente "meio vinculado" do lado do WhatsApp.
        avisoWhatsapp = 'A instância já estava desconectada, então o WhatsApp pode não ter '
          + 'liberado o número na hora. Se o pareamento falhar, remova o aparelho antigo em '
          + 'WhatsApp > Aparelhos conectados no celular do número usado por esta família.';
        console.warn(`[LGPD] ${instanceName}: instância desconectada (${estado.estado}) antes de apagar — logout não pôde ser enviado ao WhatsApp.`);
      }

      const logout = await provider.desconectarInstancia(evolutionConfig, instanceName);
      if (!logout.desconectada) {
        console.warn(`[LGPD] ${instanceName}: logout respondeu status ${logout.status} (não-ok) ao apagar.`);
      }

      const apagou = await provider.apagarInstancia(evolutionConfig, instanceName);
      if (!apagou.apagada) {
        console.warn(`[LGPD] ${instanceName}: exclusão da instância no servidor respondeu status ${apagou.status} (não-ok).`);
      }
    } catch (err) {
      // Instância pode já não existir no servidor — não impede a exclusão do dado.
      console.warn(`[LGPD] ${configCanal.instanceName}: erro ao desligar/apagar no servidor Evolution: ${err.message}`);
    }
  }

  const contagem = await apagarHousehold(householdId);

  const loginsRemovidos = [];
  for (const membro of membros) {
    if (membro.id.startsWith('wa-') || membro.id.startsWith('pendente-')) continue; // sem login
    try {
      await admin.auth().deleteUser(membro.id);
      loginsRemovidos.push(membro.id);
    } catch {
      // Login pode já não existir.
    }
  }

  return { nome: familia.name || null, contagem, loginsRemovidos, avisoWhatsapp };
}

/**
 * Apaga os arquivos de anexo da família, por prefixo.
 *
 * Sem isto, sobra print de extrato de um cliente que pediu para sumir — e o
 * serviço que existe justamente para impedir isso teria deixado passar o dado
 * mais sensível de todos.
 *
 * Nunca lança: uma falha aqui não pode impedir a eliminação dos documentos, que
 * é a maior parte do dado. Mas o resultado ENTRA na contagem devolvida, então a
 * falha aparece no log da agendada e no retorno do painel do operador em vez de
 * sumir. Anexo que sobrou é o tipo de pendência que precisa de alguém sabendo.
 */
async function apagarAnexosDaFamilia(householdId) {
  if (!process.env.STORAGE_BUCKET_ANEXOS) return 'sem bucket configurado';

  try {
    const anexoService = require('./anexoService');
    await anexoService.apagarDaFamilia(householdId);
    return 'apagados';
  } catch (err) {
    console.error(`[LGPD] FALHOU ao apagar anexos de ${householdId}:`, err.message);
    return `FALHOU: ${err.message}`;
  }
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

/**
 * Apaga todas as famílias cujo prazo venceu. É o corpo da agendada diária.
 *
 * Estava inline no `index.js` até 21/08/2026, sem try/catch por item: uma
 * família que falhasse derrubava as seguintes, e elas ficariam esperando o dia
 * seguinte sem ninguém saber. Agora cada uma é isolada — o resultado diz
 * quantas foram e quantas falharam, e o log nomeia qual.
 *
 * Não é testável em vitest: `lgpdService` importa `firebaseAdmin` no topo e a
 * trava da regra 2 derruba a suíte. A verificação é ponta a ponta, contra
 * homologação (`tools/testar-chamados-ponta-a-ponta.js`).
 */
async function executarExclusoesPendentes(agora = new Date()) {
  const familias = await familiasParaApagar(agora);

  if (!familias.length) {
    console.log('[LGPD] Nenhuma exclusão vencida.');
    return { encontradas: 0, apagadas: 0, falhas: 0 };
  }

  let apagadas = 0;
  let falhas = 0;

  for (const householdId of familias) {
    try {
      const contagem = await apagarHousehold(householdId);
      apagadas += 1;
      console.warn(`[LGPD] Família ${householdId} eliminada:`, JSON.stringify(contagem));
    } catch (err) {
      falhas += 1;
      console.error(`[LGPD] Falhou ao eliminar ${householdId}:`, err.message);
    }
  }

  return { encontradas: familias.length, apagadas, falhas };
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
  apagarFamiliaAgora,
  apagarEmLote,
  familiasParaApagar,
  executarExclusoesPendentes,
  sairDaFamilia,
};
