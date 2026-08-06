/**
 * Telefone celular brasileiro — validação e normalização.
 *
 * Existe porque um número errado falha em silêncio e só aparece muito depois:
 * o membro entrou com `6499715453` (dez dígitos, faltando o 9 do celular), o
 * cadastro aceitou, e os gastos dele simplesmente não eram atribuídos a
 * ninguém. Ninguém erra na hora — descobre semanas depois, com o relatório
 * errado.
 *
 * Regra aplicada: DDD válido + 9 + oito dígitos. Fixo não entra, porque o
 * canal é WhatsApp.
 */

// DDDs em uso no Brasil. A lista é fechada de propósito: "qualquer dois
// dígitos" aceitaria 00, 10, 20 e outros que não existem, e o erro de digitação
// mais comum é justamente trocar o DDD.
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

const DDI_BRASIL = '55';

function apenasDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

/** Tira o DDI 55 quando presente, devolvendo DDD + número. */
function semDDI(digitos) {
  if (digitos.length === 13 && digitos.startsWith(DDI_BRASIL)) return digitos.slice(2);
  if (digitos.length === 12 && digitos.startsWith(DDI_BRASIL)) return digitos.slice(2);
  return digitos;
}

/**
 * Valida um celular brasileiro.
 * @returns {{valido: boolean, erro: string|null, e164: string|null}}
 */
function validarCelular(entrada) {
  const digitos = apenasDigitos(entrada);

  if (!digitos) return { valido: false, erro: 'Informe o WhatsApp.', e164: null };

  const local = semDDI(digitos);

  if (local.length < 11) {
    return {
      valido: false,
      // Mensagem que diz o que fazer, não o que está errado.
      erro: 'Faltam dígitos. Use DDD + 9 + o número: (64) 99955-5364.',
      e164: null,
    };
  }

  if (local.length > 11) {
    return { valido: false, erro: 'Número longo demais. Use DDD + 9 + o número.', e164: null };
  }

  const ddd = Number(local.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) {
    return { valido: false, erro: `DDD ${local.slice(0, 2)} não existe.`, e164: null };
  }

  if (local[2] !== '9') {
    return {
      valido: false,
      erro: 'Celular no Brasil começa com 9 depois do DDD. Fixo não recebe WhatsApp.',
      e164: null,
    };
  }

  return { valido: true, erro: null, e164: `${DDI_BRASIL}${local}` };
}

/** Só o número pronto para o WhatsApp, ou null. */
function normalizarCelular(entrada) {
  return validarCelular(entrada).e164;
}

/** (64) 99955-5364 — para mostrar ao cliente. */
function formatarCelular(entrada) {
  const local = semDDI(apenasDigitos(entrada));
  if (local.length !== 11) return String(entrada || '');
  return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
}

module.exports = {
  DDDS_VALIDOS,
  apenasDigitos,
  semDDI,
  validarCelular,
  normalizarCelular,
  formatarCelular,
};
