/**
 * ============================================================
 *  CONFIGURAÇÃO DA LION TECH — EDITE TUDO POR AQUI
 * ============================================================
 *  Este é o ÚNICO arquivo que você precisa mexer para trocar
 *  WhatsApp, Instagram, endereço e mensagens automáticas.
 */

// ── WhatsApp ────────────────────────────────────────────────
// Formato internacional, apenas números: 55 + DDD + número.
// Exemplo: "5564999550000"
export const WHATSAPP_NUMBER = '5564999555364'

// ── Redes sociais ───────────────────────────────────────────
export const INSTAGRAM_USER = 'liontechti'
export const INSTAGRAM_URL = `https://instagram.com/${INSTAGRAM_USER}`
export const SITE_URL = 'https://www.liontechti.com.br/'

// ── Empresa / endereço (dados públicos do CNPJ) ─────────────
export const COMPANY_NAME = 'Lion Tech Soluções em TI'
export const COMPANY_CITY = 'Mineiros-GO'
export const COMPANY_ADDRESS = 'Segunda Avenida, nº 87, Qd. 66 Lt. 03 — Centro, Mineiros-GO, 75830-082'

// Link "abrir no Google Maps" e mapa incorporado
const MAPS_QUERY = encodeURIComponent('Lion Tech Soluções em TI, Segunda Avenida 87, Centro, Mineiros - GO')
export const GOOGLE_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${MAPS_QUERY}`
export const GOOGLE_MAPS_EMBED_URL = `https://www.google.com/maps?q=${MAPS_QUERY}&output=embed`

// ── Mensagens pré-preenchidas do WhatsApp ───────────────────
export const WHATSAPP_MESSAGES = {
  agendar: 'Olá, vim pelo site da Lion Tech e gostaria de agendar uma manutenção.',
  orcamento: 'Olá, gostaria de solicitar um orçamento para meu computador/notebook/celular.',
  limpeza: 'Olá, meu PC gamer precisa de limpeza preventiva. Gostaria de agendar.',
  foto: 'Olá, quero enviar uma foto do problema para avaliação.',
  tecnico: 'Olá, vim pelo site da Lion Tech e gostaria de falar com um técnico.',
  produtos: 'Olá, vim pelo site da Lion Tech e gostaria de consultar a disponibilidade de um produto.',
}

/** Monta o link do WhatsApp com a mensagem pré-preenchida. */
export function whatsappLink(message = WHATSAPP_MESSAGES.agendar) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}
