/**
 * Quanto a IA custou, de verdade, por dia e por família.
 *
 * Até 22/08/2026 o custo de cada chamada era CALCULADO e jogado no
 * `console.log` — some com o log e não soma com nada. Para decidir preço,
 * escolher modelo ou perceber uma família consumindo demais, era preciso
 * garimpar log ou rodar `tools/medir-custo-assistente.js` na mão.
 *
 * O registro é AGREGADO, nunca uma linha por chamada: um documento por dia,
 * com totais e a quebra por família. Guardar cada pergunta seria criar uma
 * coleção que só cresce, para responder a mesma pergunta que quatro números
 * respondem — e ainda por cima com o texto do cliente dentro.
 *
 * Nada aqui lança. Contabilidade de custo que derruba a resposta ao cliente
 * seria trocar receita por planilha.
 */

const { hojeNoBrasil } = require('../utils/fusoBrasil');

const COLECAO = 'custosIA';

/** Origens que se quer distinguir: cada uma é uma decisão de produto diferente. */
const ORIGENS = {
  CHAT: 'chat',
  PARSER: 'parser',
  MIDIA: 'midia',
};

function criarCustoIAService({ db, admin, agora = () => new Date() }) {
  const incrementar = (n) => admin.firestore.FieldValue.increment(n);

  /**
   * Soma uma chamada ao total do dia.
   *
   * `increment` em vez de ler-somar-gravar: várias chamadas simultâneas de
   * famílias diferentes caem no mesmo documento do dia, e ler antes de somar
   * perderia registros silenciosamente.
   */
  async function registrar({ householdId, origem, modelo, custoBRL, entrada = 0, saida = 0 }) {
    try {
      const valor = Number(custoBRL);
      if (!Number.isFinite(valor) || valor < 0) return;

      const dia = hojeNoBrasil(agora());
      const tipo = Object.values(ORIGENS).includes(origem) ? origem : ORIGENS.CHAT;

      const patch = {
        dia,
        atualizadoEm: agora().toISOString(),
        totalBRL: incrementar(valor),
        chamadas: incrementar(1),
        tokensEntrada: incrementar(Number(entrada) || 0),
        tokensSaida: incrementar(Number(saida) || 0),
        [`porOrigem.${tipo}.totalBRL`]: incrementar(valor),
        [`porOrigem.${tipo}.chamadas`]: incrementar(1),
      };

      if (householdId) {
        patch[`porFamilia.${householdId}.totalBRL`] = incrementar(valor);
        patch[`porFamilia.${householdId}.chamadas`] = incrementar(1);
      }
      if (modelo) patch[`porModelo.${String(modelo).replace(/\./g, '_')}`] = incrementar(valor);

      await db.collection(COLECAO).doc(dia).set(patch, { merge: true });
    } catch (err) {
      console.warn('[CustoIA] Não consegui registrar o custo:', err.message);
    }
  }

  /**
   * Os últimos N dias, do mais novo para o mais antigo, com o total do período.
   *
   * Sem `orderBy` no Firestore (regra 12): o id do documento É o dia em
   * formato ordenável, então a ordenação em memória sai de graça e sem índice.
   */
  async function ultimosDias(dias = 30) {
    const fim = agora();
    const ids = [];
    for (let i = 0; i < dias; i += 1) {
      const d = new Date(fim.getTime() - i * 24 * 60 * 60 * 1000);
      ids.push(hojeNoBrasil(d));
    }

    const docs = await db.getAll(...ids.map((id) => db.collection(COLECAO).doc(id)));
    const encontrados = docs
      .filter((d) => d.exists)
      .map((d) => ({ dia: d.id, ...d.data() }))
      .sort((a, b) => b.dia.localeCompare(a.dia));

    const totalBRL = encontrados.reduce((s, d) => s + (d.totalBRL || 0), 0);
    const chamadas = encontrados.reduce((s, d) => s + (d.chamadas || 0), 0);

    return {
      dias: encontrados,
      totalBRL: Number(totalBRL.toFixed(4)),
      chamadas,
      // Projeção simples: a média diária do período vezes 30. É o número que
      // responde "isso cabe na mensalidade?" sem fingir precisão que não tem.
      projecaoMensalBRL: encontrados.length
        ? Number(((totalBRL / encontrados.length) * 30).toFixed(2))
        : 0,
      mediaDiariaBRL: encontrados.length
        ? Number((totalBRL / encontrados.length).toFixed(4))
        : 0,
    };
  }

  /** Quem mais consome, no período. Serve para achar abuso e caso de suporte. */
  async function porFamilia(dias = 30, limite = 10) {
    const { dias: registros } = await ultimosDias(dias);

    const soma = {};
    for (const registro of registros) {
      for (const [id, dados] of Object.entries(registro.porFamilia || {})) {
        soma[id] = soma[id] || { householdId: id, totalBRL: 0, chamadas: 0 };
        soma[id].totalBRL += dados.totalBRL || 0;
        soma[id].chamadas += dados.chamadas || 0;
      }
    }

    return Object.values(soma)
      .map((f) => ({ ...f, totalBRL: Number(f.totalBRL.toFixed(4)) }))
      .sort((a, b) => b.totalBRL - a.totalBRL)
      .slice(0, limite);
  }

  return { registrar, ultimosDias, porFamilia };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { db, admin } = require('../config/firebaseAdmin');
    _padrao = criarCustoIAService({ db, admin });
  }
  return _padrao;
}

module.exports = {
  criarCustoIAService,
  COLECAO,
  ORIGENS,
  registrar: (...a) => servico().registrar(...a),
  ultimosDias: (...a) => servico().ultimosDias(...a),
  porFamilia: (...a) => servico().porFamilia(...a),
};
