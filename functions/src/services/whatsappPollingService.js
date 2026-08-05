const { db, admin } = require('../config/firebaseAdmin');
const { escopoDe } = require('../data/escopo');
const { fetchGroupMessages, fetchOwnJid } = require('./evolutionApiService');
const { lancarPorTexto, jaProcessada, looksLikeFinancialMessage } = require('./lancamentoPorMensagem');

/**
 * Polling agendado — rede de segurança do webhook.
 *
 * Roda a cada 2 minutos e relê as mensagens recentes do grupo. Se o webhook
 * falhar (servidor fora do ar, URL errada, token vencido), nada se perde: o
 * polling encontra a mensagem no histórico. A deduplicação por messageId
 * garante que os dois caminhos não lancem a mesma coisa duas vezes.
 */

function textoDaMensagem(msg) {
  return msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.ephemeralMessage?.message?.conversation
    || null;
}

/**
 * Processa uma mensagem, aceitando vários lançamentos separados por linha.
 * @returns {Promise<number>} quantidade de lançamentos criados
 */
async function processarMensagem(msg, householdId) {
  const messageId = msg.key?.id;
  const texto = textoDaMensagem(msg);
  if (!texto) return 0;

  const senderJid = msg.key?.participant || msg.key?.remoteJid || null;
  const pushName = msg.pushName || msg.verifiedBizName || null;
  const groupId = msg.key?.remoteJid;

  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const linhasFinanceiras = linhas.filter(looksLikeFinancialMessage);
  if (!linhasFinanceiras.length) return 0;

  const dataDaMensagem = msg.messageTimestamp
    ? new Date(msg.messageTimestamp * 1000).toISOString()
    : new Date().toISOString();

  const dados = escopoDe(householdId);
  let criados = 0;

  for (let i = 0; i < linhasFinanceiras.length; i++) {
    const linha = linhasFinanceiras[i];
    // ID próprio por linha, para deduplicar cada lançamento separadamente
    const idDaLinha = linhasFinanceiras.length > 1 ? `${messageId}_line${i}` : messageId;

    if (await jaProcessada(idDaLinha)) continue;

    const log = await dados.criar('whatsappLogs', {
      messageId: idDaLinha,
      groupId,
      sender: pushName || 'Você',
      messageType: 'TEXT',
      content: linha,
      processingStatus: 'PENDING',
      rawPayload: msg,
    });

    const { transacoes, erro } = await lancarPorTexto({
      householdId,
      texto: linha,
      senderJid,
      pushName,
      dataDaMensagem,
      origem: 'grupo',
    });

    if (erro) {
      await dados.atualizar('whatsappLogs', log.id, { processingStatus: 'ERROR', errorMessage: erro });
      continue;
    }

    await dados.atualizar('whatsappLogs', log.id, {
      processingStatus: 'PROCESSED',
      transactionId: transacoes[0],
    });
    criados += transacoes.length;
  }

  return criados;
}

async function processarLote(mensagens, householdId, ignorarAntesDe = 0) {
  const umDiaAtras = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  const minimo = Math.max(umDiaAtras, ignorarAntesDe);

  let processadas = 0, puladas = 0, erros = 0;

  for (const msg of mensagens) {
    const timestamp = msg.messageTimestamp || 0;
    if (timestamp && timestamp < minimo) { puladas++; continue; }
    if (await jaProcessada(msg.key?.id)) { puladas++; continue; }

    try {
      processadas += await processarMensagem(msg, householdId);
    } catch (err) {
      console.error('[Polling] Erro ao processar mensagem:', err.message);
      erros++;
    }
  }

  return { processed: processadas, skipped: puladas, errors: erros };
}

/**
 * Polling de uma família. Usa lock distribuído para que duas execuções
 * simultâneas não criem lançamentos duplicados.
 */
async function pollForHousehold(householdId, config) {
  const resultado = { checked: 0, processed: 0, skipped: 0, errors: 0 };

  try {
    const lockRef = db.collection('pollingLocks').doc(householdId);
    const lockDoc = await lockRef.get();
    const idadeDoLock = lockDoc.exists
      ? Math.floor(Date.now() / 1000) - (lockDoc.data().lockedAt || 0)
      : 999;

    if (idadeDoLock < 60) {
      console.log(`[Polling] Lock ativo para ${householdId}, pulando.`);
      return resultado;
    }
    await lockRef.set({ lockedAt: Math.floor(Date.now() / 1000), householdId });

    const ignorarAntesDe = config.lastResetAt || 0;

    // Grupo: pega as próprias mensagens e as dos outros membros.
    const [minhas, dosOutros] = await Promise.all([
      fetchGroupMessages(config, config.groupId, { fromMe: true, limit: 50 }),
      fetchGroupMessages(config, config.groupId, { fromMe: false, limit: 50 }),
    ]);
    const doGrupo = [...minhas, ...dosOutros];
    resultado.checked += doGrupo.length;

    const doGrupoResultado = await processarLote(doGrupo, householdId, ignorarAntesDe);
    resultado.processed += doGrupoResultado.processed;
    resultado.skipped += doGrupoResultado.skipped;
    resultado.errors += doGrupoResultado.errors;

    // Auto-conversa ("Mensagens para mim") só quando explicitamente habilitada.
    if (config.allowPrivateChat) {
      const meuJid = await fetchOwnJid(config);
      if (meuJid) {
        const privadas = await fetchGroupMessages(config, meuJid, { fromMe: undefined, limit: 50 });
        resultado.checked += privadas.length;
        const privadasResultado = await processarLote(privadas, householdId, ignorarAntesDe);
        resultado.processed += privadasResultado.processed;
        resultado.skipped += privadasResultado.skipped;
        resultado.errors += privadasResultado.errors;
      }
    }

    await db.collection('whatsappConfigs').doc(householdId).update({
      lastPolledAt: admin.firestore.FieldValue.serverTimestamp(),
      lastPollError: admin.firestore.FieldValue.delete(),
      lastPollErrorAt: admin.firestore.FieldValue.delete(),
    });
  } catch (err) {
    console.error(`[Polling] Erro na família ${householdId}:`, err.message);
    resultado.errors++;

    resultado.error = /fetch failed/i.test(err.message)
      ? 'Não foi possível conectar à Evolution API. Verifique se o servidor está online e a URL/chave estão corretas.'
      : err.message;

    // Persiste o erro para a tela mostrar o motivo, em vez de falhar em silêncio.
    try {
      await db.collection('whatsappConfigs').doc(householdId).update({
        lastPollError: resultado.error,
        lastPollErrorAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch { /* diagnóstico não pode derrubar o polling */ }
  }

  return resultado;
}

/** Polling de todas as famílias com a integração ativa. */
async function pollAllHouseholds() {
  const snap = await db.collection('whatsappConfigs').where('enabled', '==', true).get();

  const resultados = [];
  for (const doc of snap.docs) {
    const config = doc.data();
    if (!config.groupId || !config.evolutionApiUrl || !config.apiKey) continue;
    resultados.push({ householdId: doc.id, ...(await pollForHousehold(doc.id, config)) });
  }

  console.log('[Polling] Resultado:', JSON.stringify(resultados));
  return resultados;
}

module.exports = { pollAllHouseholds, pollForHousehold };
