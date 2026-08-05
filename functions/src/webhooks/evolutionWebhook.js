const { escopoDe } = require('../data/escopo');
const { createLog, updateLog } = require('../services/whatsappLogService');
const {
  acharHouseholdPorOrigem,
  lancarPorTexto,
  jaProcessada,
  looksLikeFinancialMessage,
} = require('../services/lancamentoPorMensagem');

/**
 * Webhook do Evolution — porta de entrada instantânea das mensagens.
 * O polling agendado cobre o mesmo caminho como rede de segurança; a
 * deduplicação por messageId impede que os dois lancem a mesma coisa.
 */

function extrairMensagem(payload) {
  try {
    const data = payload.data || payload;
    const fromMe = data.key?.fromMe || false;
    const remoteJid = data.key?.remoteJid || null;

    let content = null;
    let messageType = 'TEXT';

    if (data.message?.conversation) {
      content = data.message.conversation;
    } else if (data.message?.extendedTextMessage?.text) {
      content = data.message.extendedTextMessage.text;
    } else if (data.message?.imageMessage) {
      content = data.message.imageMessage.caption || null;
      messageType = 'IMAGE';
    } else if (data.message?.audioMessage) {
      messageType = 'AUDIO';
    } else if (data.message?.documentMessage || data.message?.videoMessage) {
      messageType = 'DOCUMENT';
    } else if (data.message?.stickerMessage) {
      messageType = 'STICKER';
    }

    return {
      messageId: data.key?.id || null,
      remoteJid,
      fromMe,
      // Em grupo o remetente vem em key.participant; em conversa privada é o remoteJid.
      senderJid: data.key?.participant || (fromMe ? null : remoteJid) || null,
      pushName: data.pushName || null,
      timestamp: data.messageTimestamp || null,
      content,
      messageType,
      instanceName: payload.instance || null,
    };
  } catch {
    return {
      messageId: null, remoteJid: null, fromMe: false, senderJid: null, pushName: null,
      timestamp: null, content: null, messageType: 'TEXT', instanceName: null,
    };
  }
}

const COMANDOS = ['resumo', 'ultimos', 'últimos', 'apagar ultimo', 'apagar último', 'categorias', 'ajuda', '/resumo', '/ultimos', '/ajuda'];

function ehComando(texto) {
  const t = texto.trim().toLowerCase();
  return COMANDOS.some((c) => t === c || t.startsWith(`${c} `));
}

async function handleEvolutionWebhook(req, res) {
  // Responde antes de processar: o Evolution reenvia a mensagem se demorarmos,
  // e reenvio vira risco de lançamento duplicado.
  res.status(200).json({ received: true });

  try {
    const msg = extrairMensagem(req.body);

    const encontrado = await acharHouseholdPorOrigem(msg.remoteJid, msg.instanceName);
    if (!encontrado) return; // origem desconhecida: ignora sem registrar log

    const { householdId } = encontrado;
    const dados = escopoDe(householdId);

    const ehPrivado = !msg.remoteJid?.endsWith('@g.us');
    const origem = ehPrivado ? 'chat privado' : 'grupo';

    // Mídia ainda não é interpretada. Registra como pendente só no grupo, para
    // ficar visível na tela; no privado ignora em silêncio.
    if (['IMAGE', 'AUDIO', 'DOCUMENT'].includes(msg.messageType)) {
      if (!ehPrivado && !(await jaProcessada(msg.messageId))) {
        const log = await createLog(dados, {
          messageId: msg.messageId,
          groupId: msg.remoteJid,
          sender: msg.pushName || 'desconhecido',
          messageType: msg.messageType,
          content: msg.content,
          processingStatus: 'PENDING',
          rawPayload: req.body,
        });
        await updateLog(log.id, {
          errorMessage: `Processamento de ${msg.messageType.toLowerCase()} ainda não implementado.`,
        });
      }
      return;
    }

    if (msg.messageType !== 'TEXT' || !msg.content) return;
    if (ehComando(msg.content)) return;

    // Filtro barato antes de acionar a IA: conversa comum não vira lançamento.
    if (!looksLikeFinancialMessage(msg.content)) return;

    // Deduplicação: a mesma mensagem pode chegar por reenvio do Evolution e
    // também pelo polling.
    if (await jaProcessada(msg.messageId)) return;

    const log = await createLog(dados, {
      messageId: msg.messageId,
      groupId: msg.remoteJid,
      sender: msg.pushName || (msg.fromMe ? 'você' : 'desconhecido'),
      messageType: 'TEXT',
      content: msg.content,
      processingStatus: 'PENDING',
      rawPayload: req.body,
    });

    const dataDaMensagem = msg.timestamp
      ? new Date(msg.timestamp * 1000).toISOString()
      : new Date().toISOString();

    const { transacoes, erro } = await lancarPorTexto({
      householdId,
      texto: msg.content,
      senderJid: msg.senderJid,
      pushName: msg.pushName,
      dataDaMensagem,
      origem,
    });

    if (erro) {
      await updateLog(log.id, { processingStatus: 'ERROR', errorMessage: erro });
      return;
    }

    await updateLog(log.id, { processingStatus: 'PROCESSED', transactionId: transacoes[0] });
  } catch (err) {
    console.error('[Webhook] Erro:', err);
  }
}

module.exports = { handleEvolutionWebhook, extrairMensagem, ehComando };
