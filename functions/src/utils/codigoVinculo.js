/**
 * Codigo curto que a familia manda no grupo para vincula-lo a conta
 * ("vincular ABC123").
 *
 * Mora num modulo proprio, sem dependencia nenhuma, de proposito: quando essa
 * funcao vivia em comandosWhatsapp.js havia um ciclo com householdService, e
 * dependendo da ordem de carga ela chegava como undefined — o que derrubaria a
 * criacao de conta de cliente novo. Modulo folha nao entra em ciclo.
 */

// Sem 0/O e sem 1/I: o codigo e lido e digitado por gente.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TAMANHO = 6;

function gerarCodigoVinculo() {
  let codigo = '';
  for (let i = 0; i < TAMANHO; i++) {
    codigo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return codigo;
}

module.exports = { gerarCodigoVinculo, ALFABETO, TAMANHO };
