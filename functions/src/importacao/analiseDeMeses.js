/**
 * Classifica o RISCO de importar cada mês do extrato.
 *
 * A importação é pensada como retroativa: serve para trazer a história
 * financeira anterior ao uso do sistema. Mês que ainda não tem lançamento
 * nenhum é território livre — importar ali não tem como duplicar nada.
 *
 * O problema é o mês que JÁ tem lançamentos, normalmente feitos pelo WhatsApp,
 * que é a forma principal de uso do produto. Ali existe risco real de o mesmo
 * gasto entrar duas vezes.
 *
 * A saída escolhida NÃO é travar o mês. Travar transformaria um problema de
 * informação num problema de produto: a pessoa que perdeu o celular por duas
 * semanas e quer completar o mês ficaria sem saída, e a funcionalidade
 * pareceria quebrada. Em vez disso, o mês conflitante vem com:
 *
 *   1. os números concretos (o que já existe, o que seria somado, e quanto o
 *      total do mês vira depois) — aviso genérico não ajuda ninguém a decidir;
 *   2. a lista das linhas do extrato que provavelmente JÁ existem, casadas por
 *      valor exato e data próxima contra o que a família já lançou;
 *   3. essas linhas desmarcadas por padrão, para o caminho preguiçoso ser o
 *      seguro.
 *
 * Somado ao fato de a importação inteira poder ser desfeita depois (todo
 * lançamento leva o id do lote), a pessoa tem informação antes, escolha
 * durante e volta atrás depois.
 */

const RISCO = {
  LIVRE: 'livre',           // mês sem nenhum lançamento: pode importar à vontade
  COM_DADOS: 'com_dados',   // já tem lançamentos: exige atenção
};

/** Janela de tolerância entre a data do banco e a data que a pessoa lançou. */
const DIAS_DE_TOLERANCIA = 3;

function mesDe(dataISO) {
  return String(dataISO || '').slice(0, 7);
}

function diferencaEmDias(a, b) {
  return Math.abs((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000);
}

/**
 * Marca as linhas do extrato que provavelmente já existem na família.
 *
 * O casamento é por VALOR EXATO + data próxima, e não por descrição: o texto
 * do banco ("Compra no débito - SUPERMERCADO BOM PRECO") nunca vai bater com
 * o que a pessoa escreveu no WhatsApp ("mercado"). O valor é o que os dois
 * têm em comum.
 *
 * Medido no extrato real que guiou este desenho: entre 39 gastos de um mês,
 * 37 tinham valores distintos e só 1 par colidia numa janela de 3 dias —
 * compra de verdade quase sempre tem centavo, e o centavo funciona como
 * assinatura. Ainda assim isto é uma SUGESTÃO exibida para conferência, nunca
 * um descarte automático.
 *
 * Cada lançamento existente casa com no máximo uma linha do extrato: sem
 * isso, três compras de R$ 50,00 no mesmo dia marcariam umas às outras.
 */
function marcarProvaveisDuplicatas(transacoes, existentes, { toleranciaDias = DIAS_DE_TOLERANCIA } = {}) {
  const disponiveis = existentes.map((e) => ({
    valor: Number(e.amount),
    data: typeof e.date === 'string' ? e.date.slice(0, 10) : e.date?.toISOString?.().slice(0, 10),
    tipo: e.type,
    descricao: e.description,
    origem: e.origin,
    usado: false,
  }));

  return transacoes.map((t) => {
    const candidato = disponiveis.find((e) => !e.usado
      && e.tipo === t.tipo
      && Math.abs(e.valor - t.valor) < 0.005
      && e.data && diferencaEmDias(e.data, t.data) <= toleranciaDias);

    if (!candidato) return { ...t, provavelDuplicata: null };

    candidato.usado = true;
    return {
      ...t,
      provavelDuplicata: {
        descricao: candidato.descricao,
        data: candidato.data,
        valor: candidato.valor,
        origem: candidato.origem,
      },
    };
  });
}

/**
 * Monta o resumo por mês que a tela usa para orientar a decisão.
 *
 * @param {Array} transacoes  linhas do extrato (já com `provavelDuplicata`)
 * @param {Object} resumoExistentePorMes  { '2026-07': { quantidade, total } }
 */
function resumirMeses(transacoes, resumoExistentePorMes = {}) {
  const meses = new Map();

  for (const t of transacoes) {
    const mes = mesDe(t.data);
    if (!meses.has(mes)) {
      meses.set(mes, {
        mes,
        quantidade: 0,
        totalGastos: 0,
        totalEntradas: 0,
        provaveisDuplicatas: 0,
      });
    }

    const m = meses.get(mes);
    m.quantidade += 1;
    if (t.tipo === 'EXPENSE') m.totalGastos = Number((m.totalGastos + t.valor).toFixed(2));
    else m.totalEntradas = Number((m.totalEntradas + t.valor).toFixed(2));
    if (t.provavelDuplicata) m.provaveisDuplicatas += 1;
  }

  return [...meses.values()]
    .map((m) => {
      const jaExiste = resumoExistentePorMes[m.mes] || { quantidade: 0, totalGastos: 0 };
      const risco = jaExiste.quantidade > 0 ? RISCO.COM_DADOS : RISCO.LIVRE;

      return {
        ...m,
        risco,
        jaExiste: {
          quantidade: jaExiste.quantidade,
          totalGastos: Number((jaExiste.totalGastos || 0).toFixed(2)),
        },
        // O número que faz a pessoa decidir com segurança: como o mês fica
        // DEPOIS. Aviso genérico não diz nada; ver "R$ 3.400 vira R$ 12.300"
        // deixa na hora evidente se faz sentido.
        totalGastosDepois: Number(((jaExiste.totalGastos || 0) + m.totalGastos).toFixed(2)),
        // Sugestão do sistema: mês livre entra inteiro; mês com dados entra
        // sem as linhas que parecem repetidas.
        sugestaoImportar: risco === RISCO.LIVRE ? m.quantidade : m.quantidade - m.provaveisDuplicatas,
      };
    })
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

module.exports = {
  RISCO,
  DIAS_DE_TOLERANCIA,
  marcarProvaveisDuplicatas,
  resumirMeses,
  mesDe,
};
