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
  const { fromMe, limit = 50 } = options;
  if (!config.evolutionApiUrl || !config.instanceName || !config.apiKey) {
    throw new Error('Configuração da Evolution API incompleta.');
  }
  const url = `${BASE(config)}/chat/findMessages/${config.instanceName}`;
  // Se fromMe for undefined, não filtra por direção (pega todas as mensagens do chat)
  const keyFilter = fromMe !== undefined ? { remoteJid, fromMe } : { remoteJid };
  return evFetch(url, config.apiKey, { where: { key: keyFilter }, limit });
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
      i.name === config.instanceName ||
      i.instanceName === config.instanceName ||
      i.instance?.instanceName === config.instanceName
    );
    // Evolution API v2 retorna 'ownerJid', outras versões podem usar 'owner'
    const owner = instance?.ownerJid || instance?.owner || instance?.instance?.ownerJid || null;
    console.log('[fetchOwnJid] JID encontrado:', owner);
    return owner;
  } catch {
    return null;
  }
}

module.exports = { fetchGroupMessages, fetchOwnJid };
