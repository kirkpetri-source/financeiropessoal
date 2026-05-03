/**
 * Resolve o nome do pagador com base em:
 * 1. Nome explícito (do parser) — maior prioridade
 * 2. Número de telefone do remetente (JID) — identifica automaticamente
 * 3. pushName do WhatsApp — último recurso
 *
 * @param {string|null} parsedName - Nome detectado no final da mensagem
 * @param {string|null} senderJid - JID do remetente (ex: "5564999555364@s.whatsapp.net")
 * @param {string|null} pushName - Nome do perfil WhatsApp
 * @param {Array<{name:string, phone:string|null}>} payers - Pagadores configurados
 */
function resolvePayerName(parsedName, senderJid, pushName, payers = []) {
  // 1. Nome explícito no final da mensagem tem prioridade máxima
  if (parsedName) return parsedName;

  // 2. Tenta identificar pelo número de telefone
  if (senderJid && payers.length > 0) {
    // Extrai apenas dígitos do JID (ex: "5564999555364@s.whatsapp.net" → "5564999555364")
    const senderPhone = senderJid.replace(/@.*/, '').replace(/\D/g, '');

    const matched = payers.find((p) => {
      if (!p.phone) return false;
      const configPhone = String(p.phone).replace(/\D/g, '');
      // Compara com e sem o código do país/DDD para maior compatibilidade
      return configPhone === senderPhone ||
        configPhone.endsWith(senderPhone) ||
        senderPhone.endsWith(configPhone);
    });

    if (matched) return matched.name;
  }

  // 3. Último recurso: pushName do WhatsApp
  // (pode ser o nome completo do perfil, ex: "Kirk Douglas - Lion Tech")
  return pushName || null;
}

module.exports = { resolvePayerName };
