/**
 * Credenciais do servidor Evolution — do OPERADOR, não do cliente.
 *
 * Antes, cada família precisava informar URL, nome de instância e API key nas
 * Configurações. Isso só fazia sentido enquanto o único usuário era o Kirk, que
 * é dono da VPS. Para um cliente que comprou um controle financeiro, esses três
 * campos são impossíveis de responder — e pedir a API key de um servidor a
 * quem não o administra não é nem razoável nem seguro.
 *
 * Agora o servidor é um só, do operador, e cada família ganha uma instância
 * própria criada pelo sistema. O cliente só lê o QR Code com o WhatsApp dele.
 *
 * Configure com:
 *   EVOLUTION_SERVER_URL  no functions/.env.<projeto>   (não é segredo)
 *   firebase functions:secrets:set EVOLUTION_API_KEY    (é segredo)
 */

// Uma família = uma instância. O nome sai do householdId para ser estável e
// único, e leva prefixo para não colidir com instâncias criadas à mão no painel.
const PREFIXO_DA_INSTANCIA = 'fam';

// Teto de pessoas por família. Casa com o que a tela de assinatura promete e
// com o limite da Groups API oficial, para a migração não quebrar a promessa.
const MAX_MEMBROS = 8;

function servidor() {
  return {
    url: (process.env.EVOLUTION_SERVER_URL || '').replace(/\/$/, ''),
    apiKey: process.env.EVOLUTION_API_KEY || '',
  };
}

function servidorConfigurado() {
  const { url, apiKey } = servidor();
  return !!url && !!apiKey;
}

function exigirServidor() {
  if (!servidorConfigurado()) {
    throw Object.assign(
      new Error('Canal WhatsApp indisponível no momento. Tente novamente em instantes.'),
      { statusCode: 503, codigo: 'SERVIDOR_NAO_CONFIGURADO' },
    );
  }
  return servidor();
}

function nomeDaInstancia(householdId) {
  return `${PREFIXO_DA_INSTANCIA}-${householdId}`;
}

/**
 * URL do nosso webhook, com o token de autenticação no caminho.
 *
 * É o endereço que cada instância nova recebe na criação. Sem o token a
 * instância aponta para um endpoint que recusa tudo — e o cliente ficaria com
 * o WhatsApp conectado e nenhum lançamento entrando.
 */
function urlDoWebhook() {
  const base = (process.env.API_BASE_URL
    || 'https://southamerica-east1-financeiropessoal-29b32.cloudfunctions.net/api').replace(/\/$/, '');

  const token = process.env.EVOLUTION_WEBHOOK_TOKEN;
  if (!token) {
    throw Object.assign(
      new Error('EVOLUTION_WEBHOOK_TOKEN não configurado — não dá para provisionar instância.'),
      { statusCode: 503 },
    );
  }

  return `${base}/webhooks/evolution/${token}`;
}

/**
 * Monta a configuração efetiva do canal para uma família.
 *
 * A ordem importa. Credencial gravada no documento tem precedência sobre a do
 * servidor porque a família #1 (a do Kirk) já roda numa instância própria,
 * criada à mão antes disto existir — e ela não pode parar de funcionar por
 * causa de uma mudança de arquitetura. Cliente novo cai no servidor central.
 */
function configEfetiva(doc = {}) {
  const central = servidor();

  return {
    ...doc,
    evolutionApiUrl: doc.evolutionApiUrl || central.url || null,
    apiKey: doc.apiKey || central.apiKey || null,
    instanceName: doc.instanceName || null,
    // Instância própria = configuração legada, mantida como está. Instância
    // provisionada pelo sistema = gerenciada por nós.
    gerenciadaPeloSistema: !doc.evolutionApiUrl && !doc.apiKey,
  };
}

module.exports = {
  PREFIXO_DA_INSTANCIA,
  MAX_MEMBROS,
  servidor,
  servidorConfigurado,
  exigirServidor,
  nomeDaInstancia,
  urlDoWebhook,
  configEfetiva,
};
