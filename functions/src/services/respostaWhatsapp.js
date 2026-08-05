const { admin, db } = require('../config/firebaseAdmin');
const { provedorDe } = require('../canais');
const {
  assinar,
  ehMensagemDoBot,
  montarConfirmacao,
  montarConfirmacaoMultipla,
  ASSINATURA,
} = require('./respostaTexto');

/**
 * Envio das respostas ao WhatsApp.
 *
 * A formatação e a proteção contra loop moram em respostaTexto.js (funções
 * puras, testáveis sem dublê). Aqui fica só o I/O.
 *
 * DUAS BARREIRAS INDEPENDENTES contra o bot lançar as próprias mensagens:
 *
 *   1. O messageId devolvido no envio vira um log com status BOT, então
 *      jaProcessada() reconhece e ignora.
 *   2. A assinatura invisível no texto, verificada logo na entrada do webhook.
 *
 * Uma só não basta: a primeira depende de o provider devolver o ID, a segunda
 * de o texto chegar intacto. Juntas, cobrem a falha uma da outra.
 */

async function responder(householdId, config, destino, texto) {
  try {
    const provider = provedorDe(config);
    const { messageId } = await provider.enviarTexto(config, destino, assinar(texto));

    if (messageId) {
      await db.collection('whatsappLogs').add({
        householdId,
        messageId,
        groupId: destino,
        sender: 'sistema',
        messageType: 'TEXT',
        content: texto,
        processingStatus: 'BOT',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return { enviado: true, messageId };
  } catch (err) {
    // Falha ao responder não pode derrubar o lançamento, que é o que importa.
    console.error('[Resposta] Falha ao enviar:', err.message);
    return { enviado: false, erro: err.message };
  }
}

async function confirmarLancamentos(householdId, config, destino, transacoes) {
  if (!transacoes?.length) return { enviado: false };

  const texto = montarConfirmacaoMultipla(config?.confirmationMessageTemplate, transacoes);
  return responder(householdId, config, destino, texto);
}

module.exports = {
  responder,
  confirmarLancamentos,
  montarConfirmacao,
  montarConfirmacaoMultipla,
  ehMensagemDoBot,
  assinar,
  ASSINATURA,
};
