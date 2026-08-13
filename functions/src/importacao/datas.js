/**
 * Datas da importação, isoladas aqui por um motivo específico.
 *
 * `new Date('2026-08-13')` é interpretado como UTC pelo JavaScript, e no
 * fuso do Brasil (UTC-3) isso vira 12/08 às 21h — o lançamento aparece no
 * dia ANTERIOR, e no dia 1º do mês cai no mês anterior, contaminando o
 * relatório mensal inteiro. Todo lançamento importado carrega uma data que
 * a pessoa vai conferir contra o extrato do banco dela; errar por um dia
 * destrói a confiança na importação.
 *
 * A saída é sempre `AAAA-MM-DD` em texto — o mesmo formato que o
 * `transactionSchema` já espera no campo `date`.
 */

/** Monta AAAA-MM-DD validando o calendário (31/02 não passa). */
function paraDataISO(ano, mes, dia) {
  if (!Number.isFinite(ano) || !Number.isFinite(mes) || !Number.isFinite(dia)) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  // Ano de dois dígitos: 26 -> 2026, 98 -> 1998. Extrato bancário de família
  // nunca é de 1926, então a virada em 70 é segura.
  const anoCheio = ano < 100 ? (ano <= 70 ? 2000 + ano : 1900 + ano) : ano;

  const d = new Date(Date.UTC(anoCheio, mes - 1, dia));
  if (d.getUTCFullYear() !== anoCheio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }

  return `${String(anoCheio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Lê data de CSV de banco brasileiro, nos formatos que aparecem na prática:
 *
 *   13/08/2026  13-08-2026  13.08.2026   (dia primeiro — o normal no Brasil)
 *   2026-08-13  2026/08/13               (ISO, usado por Nubank e Inter)
 *   13/08/26                             (ano curto)
 *
 * Ambiguidade real: `05/08/2026` é 5 de agosto no Brasil e 8 de maio nos EUA.
 * Como o público é brasileiro e o arquivo vem de banco brasileiro, dia-primeiro
 * é a leitura correta. A exceção é quando o primeiro número passa de 12: aí
 * só pode ser dia mesmo, e a ordem se confirma sozinha.
 */
function lerDataBR(bruto) {
  if (!bruto) return null;
  const texto = String(bruto).trim();

  // ISO primeiro: o ano na frente elimina qualquer ambiguidade.
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(texto);
  if (iso) return paraDataISO(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const br = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(texto);
  if (br) {
    const primeiro = Number(br[1]);
    const segundo = Number(br[2]);
    // Primeiro número acima de 12 só pode ser dia; caso contrário assume
    // dia/mês, que é a convenção brasileira.
    if (primeiro > 12 && segundo <= 12) return paraDataISO(Number(br[3]), segundo, primeiro);
    return paraDataISO(Number(br[3]), segundo, primeiro);
  }

  return null;
}

/** Reconhece se um texto é data — usado para descobrir qual coluna do CSV é a data. */
function pareceData(bruto) {
  return lerDataBR(bruto) !== null;
}

module.exports = { paraDataISO, lerDataBR, pareceData };
