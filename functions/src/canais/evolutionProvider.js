/**
 * Canal Evolution API (Baileys em servidor próprio).
 */

const base = (config) => String(config.evolutionApiUrl || '').replace(/\/$/, '');

function exigirConfig(config) {
  if (!config?.evolutionApiUrl || !config?.instanceName || !config?.apiKey) {
    throw Object.assign(
      new Error('Configuração da Evolution API incompleta.'),
      { statusCode: 400 }
    );
  }
}

async function chamar(url, apiKey, corpo, metodo = 'POST') {
  const resposta = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  if (!resposta.ok) {
    const texto = await resposta.text();
    throw new Error(`Evolution API ${resposta.status}: ${texto.slice(0, 200)}`);
  }
  return resposta.json();
}

async function enviarTexto(config, destino, texto) {
  exigirConfig(config);

  const url = `${base(config)}/message/sendText/${encodeURIComponent(config.instanceName)}`;
  const resposta = await chamar(url, config.apiKey, { number: destino, text: texto });

  // O ID da mensagem enviada é essencial: sem ele não dá para reconhecer a
  // própria confirmação chegando de volta pelo webhook, e o bot lançaria a si
  // mesmo em loop.
  return { messageId: resposta?.key?.id || resposta?.messageId || null, bruto: resposta };
}

async function buscarMensagens(config, destino, opcoes = {}) {
  exigirConfig(config);

  const { fromMe, limit = 50 } = opcoes;
  const url = `${base(config)}/chat/findMessages/${encodeURIComponent(config.instanceName)}`;
  const filtro = fromMe !== undefined ? { remoteJid: destino, fromMe } : { remoteJid: destino };

  const dados = await chamar(url, config.apiKey, { where: { key: filtro }, limit });
  return dados?.messages?.records || dados?.records || dados || [];
}

/** Número da própria instância — usado para achar a auto-conversa. */
async function obterIdentidadePropria(config) {
  try {
    const resposta = await fetch(`${base(config)}/instance/fetchInstances`, {
      headers: { apikey: config.apiKey },
    });
    if (!resposta.ok) return null;

    const dados = await resposta.json();
    const instancias = Array.isArray(dados) ? dados : [dados];
    const instancia = instancias.find((i) =>
      i.name === config.instanceName
      || i.instanceName === config.instanceName
      || i.instance?.instanceName === config.instanceName);

    return instancia?.ownerJid || instancia?.owner || instancia?.instance?.ownerJid || null;
  } catch {
    return null;
  }
}

module.exports = {
  nome: 'evolution',
  suportaBusca: true,
  enviarTexto,
  buscarMensagens,
  obterIdentidadePropria,
};
