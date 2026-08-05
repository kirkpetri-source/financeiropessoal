/**
 * Compra parcelada.
 *
 * Sem isso, "geladeira 1200 em 10x" entra como um gasto de R$ 1.200 no mês —
 * e some dos nove meses seguintes, que é justamente quando o dinheiro sai.
 * O mês da compra fica artificialmente ruim e os próximos, artificialmente bons.
 *
 * Aqui a compra vira N lançamentos, um por mês, ligados pelo mesmo grupo.
 *
 * O resto é arredondamento: 100 em 3x não dá 33,33 três vezes (dá 99,99).
 * A diferença de centavos vai toda na PRIMEIRA parcela, que é como as
 * operadoras de cartão fazem — o cliente vê 33,34 + 33,33 + 33,33.
 */

// "10x", "em 10x", "3 vezes", "em 12 parcelas", "parcelado em 6"
const PADROES = [
  /\bem\s+(\d{1,2})\s*x\b/i,
  /\b(\d{1,2})\s*x\b/i,
  /\bem\s+(\d{1,2})\s+vezes\b/i,
  /\b(\d{1,2})\s+vezes\b/i,
  /\bem\s+(\d{1,2})\s+parcelas?\b/i,
  /\b(\d{1,2})\s+parcelas?\b/i,
  /\bparcelad[oa]\s+em\s+(\d{1,2})\b/i,
];

const MAXIMO_DE_PARCELAS = 60;

/**
 * Procura indicação de parcelamento no texto.
 * @returns {{ parcelas: number, textoLimpo: string } | null}
 */
function detectarParcelamento(texto) {
  if (!texto || typeof texto !== 'string') return null;

  for (const padrao of PADROES) {
    const achado = texto.match(padrao);
    if (!achado) continue;

    const parcelas = parseInt(achado[1], 10);
    if (!Number.isFinite(parcelas) || parcelas < 2 || parcelas > MAXIMO_DE_PARCELAS) continue;

    return {
      parcelas,
      // Tira a expressão do texto para não sujar a descrição do lançamento.
      textoLimpo: texto.replace(achado[0], ' ').replace(/\s{2,}/g, ' ').trim(),
    };
  }

  return null;
}

/**
 * Divide um valor em N parcelas sem perder nem inventar centavos.
 * A sobra vai na primeira, como fazem as operadoras de cartão.
 */
function dividirEmParcelas(valorTotal, parcelas) {
  const centavosTotais = Math.round(Number(valorTotal) * 100);
  const base = Math.floor(centavosTotais / parcelas);
  const sobra = centavosTotais - base * parcelas;

  return Array.from({ length: parcelas }, (_, i) => (i === 0 ? base + sobra : base) / 100);
}

/** Mesmo dia nos meses seguintes, sem cair em mês que não tem aquele dia. */
function somarMeses(data, meses) {
  const original = new Date(data);
  const diaDesejado = original.getDate();

  const resultado = new Date(original);
  resultado.setDate(1);
  resultado.setMonth(resultado.getMonth() + meses);

  // 31/01 + 1 mês vira 28/02 (ou 29), não 03/03 como o setMonth faria sozinho.
  const ultimoDiaDoMes = new Date(resultado.getFullYear(), resultado.getMonth() + 1, 0).getDate();
  resultado.setDate(Math.min(diaDesejado, ultimoDiaDoMes));

  return resultado;
}

/**
 * Monta os lançamentos de uma compra parcelada.
 * @returns {Array<{ description, amount, date, parcela, totalParcelas, grupoParcelamento, valorTotal }>}
 */
function montarParcelas({ descricao, valorTotal, parcelas, dataDaCompra, grupoParcelamento }) {
  const valores = dividirEmParcelas(valorTotal, parcelas);
  const inicio = new Date(dataDaCompra);
  const grupo = grupoParcelamento || `parc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return valores.map((valor, i) => ({
    description: `${descricao} (${i + 1}/${parcelas})`,
    amount: valor,
    date: somarMeses(inicio, i).toISOString(),
    parcela: i + 1,
    totalParcelas: parcelas,
    grupoParcelamento: grupo,
    valorTotal: Number(valorTotal),
  }));
}

module.exports = {
  detectarParcelamento,
  dividirEmParcelas,
  montarParcelas,
  somarMeses,
  MAXIMO_DE_PARCELAS,
};
