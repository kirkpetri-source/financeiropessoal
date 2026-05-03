/**
 * Serviço para consultar a Evolution API diretamente.
 * Usado pelo polling para buscar mensagens enviadas pelo próprio número (fromMe: true).
 */

async function fetchGroupMessages(config, remoteJid, options = {}) {
  const { fromMe = true, limit = 30 } = options;

  if (!config.evolutionApiUrl || !config.instanceName || !config.apiKey) {
    throw new Error('Configuração da Evolution API incompleta.');
  }

  const url = `${config.evolutionApiUrl.replace(/\/$/, '')}/chat/findMessages/${config.instanceName}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': config.apiKey,
    },
    body: JSON.stringify({
      where: { key: { remoteJid, fromMe } },
      limit,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Evolution API retornou ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();

  // Suporta diferentes formatos de resposta da Evolution API
  return data?.messages?.records || data?.records || data || [];
}

module.exports = { fetchGroupMessages };
