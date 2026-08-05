/**
 * Canais de mensagem — camada que isola o resto do sistema de QUAL WhatsApp
 * está sendo usado.
 *
 * Existem dois caminhos possíveis e eles têm trocas diferentes:
 *
 *   evolution  — Baileys num servidor próprio. Funciona hoje, custo zero por
 *                mensagem, mas é API não oficial: a Meta pode banir o número, e
 *                num número compartilhado o ban derruba todas as famílias de
 *                uma vez.
 *
 *   cloud-api  — Groups API oficial da Meta (aberta desde jun/2026). Legítima,
 *                até 8 participantes por grupo e 10.000 grupos por número, e o
 *                fluxo principal não custa nada: mensagem recebida é grátis e a
 *                resposta dentro de 24h também. Exige Official Business Account.
 *
 * O sistema conversa só com esta interface. Trocar de canal é mudar um campo na
 * configuração da família, não reescrever o processamento.
 *
 * Contrato que todo provider implementa:
 *   nome
 *   enviarTexto(config, destino, texto) -> { messageId }
 *   buscarMensagens(config, destino, opcoes) -> Message[]
 *   obterIdentidadePropria(config) -> string|null
 *   suportaBusca  — se false, o polling não roda (a Cloud API entrega só por webhook)
 */

const evolution = require('./evolutionProvider');
const cloudApi = require('./cloudApiProvider');

const PROVIDERS = {
  evolution,
  'cloud-api': cloudApi,
};

const PROVIDER_PADRAO = 'evolution';

function provedorDe(config) {
  const nome = config?.channelProvider || PROVIDER_PADRAO;
  const provider = PROVIDERS[nome];

  if (!provider) {
    throw Object.assign(
      new Error(`Canal "${nome}" não existe. Disponíveis: ${Object.keys(PROVIDERS).join(', ')}.`),
      { statusCode: 400 }
    );
  }
  return provider;
}

module.exports = { provedorDe, PROVIDERS, PROVIDER_PADRAO };
