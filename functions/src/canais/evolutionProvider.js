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

/* ------------------------------------------------------------------------- *
 * Provisionamento
 *
 * Tudo abaixo existe para que o cliente NUNCA veja a palavra "instância".
 * Ele lê um QR Code e pronto; o sistema cria, conecta, aponta o webhook e
 * monta o grupo da família por baixo.
 *
 * Testado contra Evolution API v2.3.7.
 * ------------------------------------------------------------------------- */

/** Chamada que não estoura em 404/409 — devolve o corpo e o status crus. */
async function chamarBruto(url, apiKey, corpo, metodo = 'POST') {
  const resposta = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  const texto = await resposta.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }

  return { ok: resposta.ok, status: resposta.status, dados };
}

/**
 * Cria a instância da família e já deixa o webhook apontado.
 *
 * Idempotente: instância que já existe devolve 403/409 na Evolution, e aqui
 * isso vira sucesso com `jaExistia`. O cliente pode clicar duas vezes em
 * "conectar" sem quebrar nada.
 */
async function criarInstancia(config, { instanceName, webhookUrl }) {
  const { ok, status, dados } = await chamarBruto(
    `${base(config)}/instance/create`,
    config.apiKey,
    {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      // Só MESSAGES_UPSERT: é o que o webhook trata. Assinar todos os eventos
      // multiplicaria por dez o tráfego para o Cloud Functions sem uso nenhum.
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT'],
      },
    },
  );

  if (ok) return { criada: true, jaExistia: false, bruto: dados };

  const mensagem = JSON.stringify(dados || '');
  if (status === 403 || status === 409 || /already in use|already exists/i.test(mensagem)) {
    return { criada: false, jaExistia: true, bruto: dados };
  }

  throw new Error(`Evolution ${status} ao criar instância: ${mensagem.slice(0, 200)}`);
}

/** QR Code para o cliente ler. Já conectada, devolve `conectada: true`. */
async function obterQrCode(config, instanceName) {
  const { ok, status, dados } = await chamarBruto(
    `${base(config)}/instance/connect/${encodeURIComponent(instanceName)}`,
    config.apiKey,
    null,
    'GET',
  );

  if (!ok) throw new Error(`Evolution ${status} ao gerar QR: ${JSON.stringify(dados).slice(0, 200)}`);

  // Instância já conectada não devolve QR — devolve o estado.
  if (dados?.instance?.state === 'open' || dados?.state === 'open') {
    return { conectada: true, qrcode: null, pairingCode: null };
  }

  return {
    conectada: false,
    // `base64` já vem no formato data:image/png;base64,... e vai direto no <img>.
    qrcode: dados?.base64 || null,
    // Código de pareamento por número, alternativa a ler o QR na tela.
    pairingCode: dados?.pairingCode || null,
    bruto: dados,
  };
}

/** open = conectada; connecting = aguardando leitura; close = desconectada. */
async function estadoDaConexao(config, instanceName) {
  const { ok, dados } = await chamarBruto(
    `${base(config)}/instance/connectionState/${encodeURIComponent(instanceName)}`,
    config.apiKey,
    null,
    'GET',
  );

  if (!ok) return { estado: 'inexistente', conectada: false };

  const estado = dados?.instance?.state || dados?.state || 'desconhecido';
  return { estado, conectada: estado === 'open' };
}

async function desconectarInstancia(config, instanceName) {
  await chamarBruto(
    `${base(config)}/instance/logout/${encodeURIComponent(instanceName)}`,
    config.apiKey, null, 'DELETE',
  );
  return { desconectada: true };
}

async function apagarInstancia(config, instanceName) {
  await chamarBruto(
    `${base(config)}/instance/delete/${encodeURIComponent(instanceName)}`,
    config.apiKey, null, 'DELETE',
  );
  return { apagada: true };
}

/**
 * Cria o grupo da família.
 * Participantes vazio: quem cria já entra como administrador, e os outros
 * chegam pelo link de convite — que é bem mais simples para o cliente do que
 * digitar número por número.
 */
async function criarGrupo(config, { nome, descricao, participantes = [] }) {
  const { ok, status, dados } = await chamarBruto(
    `${base(config)}/group/create/${encodeURIComponent(config.instanceName)}`,
    config.apiKey,
    { subject: nome, description: descricao, participants: participantes },
  );

  if (!ok) throw new Error(`Evolution ${status} ao criar grupo: ${JSON.stringify(dados).slice(0, 200)}`);

  const groupId = dados?.id || dados?.groupJid || dados?.key?.remoteJid || null;
  if (!groupId) throw new Error('Evolution criou o grupo mas não devolveu o ID.');

  return { groupId, bruto: dados };
}

async function linkDeConvite(config, groupId) {
  const { ok, dados } = await chamarBruto(
    `${base(config)}/group/inviteCode/${encodeURIComponent(config.instanceName)}?groupJid=${encodeURIComponent(groupId)}`,
    config.apiKey, null, 'GET',
  );

  if (!ok) return { linkConvite: null, codigo: null };
  return { linkConvite: dados?.inviteUrl || null, codigo: dados?.inviteCode || null };
}

/**
 * Participantes do grupo, com telefone normalizado.
 * É a partir daqui que o sistema sabe quem está autorizado a lançar.
 */
async function participantesDoGrupo(config, groupId) {
  const { ok, dados } = await chamarBruto(
    `${base(config)}/group/participants/${encodeURIComponent(config.instanceName)}?groupJid=${encodeURIComponent(groupId)}`,
    config.apiKey, null, 'GET',
  );

  if (!ok) return [];

  return (dados?.participants || []).map((p) => ({
    // O `id` moderno vem como @lid (identificador opaco). O telefone de verdade
    // está em phoneNumber; sem ele não dá para casar com o cadastro do membro.
    id: p.id || null,
    telefone: String(p.phoneNumber || p.id || '').replace(/@.*/, '').replace(/\D/g, '') || null,
    nome: p.name || null,
    admin: p.admin || null,
  })).filter((p) => p.telefone);
}

module.exports = {
  nome: 'evolution',
  suportaBusca: true,
  enviarTexto,
  buscarMensagens,
  obterIdentidadePropria,
  criarInstancia,
  obterQrCode,
  estadoDaConexao,
  desconectarInstancia,
  apagarInstancia,
  criarGrupo,
  linkDeConvite,
  participantesDoGrupo,
};
