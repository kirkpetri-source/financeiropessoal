/**
 * Telefone celular brasileiro no frontend — máscara e validação.
 *
 * Espelha `functions/src/utils/telefoneBR.js`, que é a fonte da verdade. Aqui
 * o objetivo é outro: impedir que o cliente CHEGUE a errar, formatando
 * enquanto ele digita e dizendo o que falta antes de ele enviar.
 *
 * O caso que motivou: um membro cadastrado como `6499715453` (sem o 9 do
 * celular). Ninguém percebeu, e os gastos dele ficaram sem atribuição.
 */

const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export function apenasDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

/** Tira o DDI 55 quando ele existe. Cuidado: 55 também é DDD do RS. */
export function semDDI(digitos) {
  return (digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')
    ? digitos.slice(2)
    : digitos;
}

/**
 * Máscara aplicada a cada tecla: (64) 99955-5364.
 * Nunca deixa passar de 11 dígitos — assim o campo não aceita o que a
 * validação vai recusar depois.
 */
export function mascararTelefone(valor) {
  const d = semDDI(apenasDigitos(valor)).slice(0, 11);

  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** @returns {string|null} mensagem de erro, ou null quando está certo */
export function erroDoTelefone(valor, { obrigatorio = true } = {}) {
  const d = semDDI(apenasDigitos(valor));

  if (!d) return obrigatorio ? 'Informe o WhatsApp.' : null;
  if (d.length < 11) return 'Faltam dígitos. Use DDD + 9 + o número.';
  if (d.length > 11) return 'Número longo demais.';
  if (!DDDS_VALIDOS.has(Number(d.slice(0, 2)))) return `DDD ${d.slice(0, 2)} não existe.`;
  if (d[2] !== '9') return 'Celular começa com 9 depois do DDD. Fixo não recebe WhatsApp.';

  return null;
}

export function telefoneValido(valor, opcoes) {
  return erroDoTelefone(valor, opcoes) === null;
}

/** Formato enviado à API. */
export function paraApi(valor) {
  const d = semDDI(apenasDigitos(valor));
  return d.length === 11 ? `55${d}` : '';
}

/** Como o número aparece nas listas. Devolve o original quando não dá. */
export function formatarParaLeitura(valor) {
  const d = semDDI(apenasDigitos(valor));
  return d.length === 11 ? mascararTelefone(d) : String(valor || '');
}
