/**
 * Serviço para consultar a Evolution API diretamente.
 */

const BASE = (config) => config.evolutionApiUrl.replace(/\/$/, '');

async function evFetch(url, apiKey, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Evolution API ${response.status}: ${text.slice(0, 200)}`);
  }
  const data = await response.json();
  return data?.messages?.records || data?.records || data || [];
}

async function fetchGroupMessages(config, remoteJid, options = {}) {
  const { fromMe = true, limit = 50 } = options;
  if (!config.evolutionApiUrl || !config.instanceName || !config.apiKey) {
    throw new Error('Configuração da Evolution API incompleta.');
  }
  const url = `${BASE(config)}/chat/findMessages/${config.instanceName}`;
  return evFetch(url, config.apiKey, { where: { key: { remoteJid, fromMe } }, limit });
}

/**
 * Obtém o JID (número) próprio da instância conectada.
 * Usado para encontrar mensagens da auto-conversa ("Mensagens para mim").
 */
async function fetchOwnJid(config) {
  try {
    const url = `${BASE(config)}/instance/fetchInstances`;
    const response = await fetch(url, {
      headers: { 'apikey': config.apiKey },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const instances = Array.isArray(data) ? data : [data];
    const instance = instances.find(i =>
      i.instance?.instanceName === config.instanceName || i.instanceName === config.instanceName
    );
    const owner = instance?.instance?.owner || instance?.owner || null;
    return owner; // ex: "556499555364@s.whatsapp.net"
  } catch {
    return null;
  }
}

module.exports = { fetchGroupMessages, fetchOwnJid };
