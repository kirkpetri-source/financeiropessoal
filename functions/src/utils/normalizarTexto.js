/**
 * Normaliza texto pra comparação exata: sem acento, minúsculo, sem espaço nas
 * pontas, sem barra inicial de comando.
 *
 * Módulo-folha (sem imports próprios) de propósito — comandosWhatsapp.js e
 * lancamentoPorMensagem.js precisam dos dois lados, e um `require` direto
 * entre eles criaria um ciclo (ver __testes__/dependencias.test.mjs).
 */
function normalizar(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acento: 'ultimos' casa com 'ultimos'
    .replace(/^\//, '');                              // aceita com ou sem barra
}

module.exports = { normalizar };
