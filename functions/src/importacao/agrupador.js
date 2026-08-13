const { chaveDeAprendizado } = require('./categorizador');

/**
 * Agrupa os lançamentos de uma importação por contraparte.
 *
 * É o que torna a revisão viável **independente do perfil do extrato**, que é
 * o problema real: nenhuma estratégia automática cobre todos os casos.
 *
 *   - Extrato de família comum: as mesmas contrapartes se repetem muito (12
 *     compras no mesmo supermercado no mês). Agrupar reduz 131 linhas a
 *     poucas dezenas de decisões.
 *   - Extrato de autônomo/empresa: dezenas de Pix de pessoas diferentes, cada
 *     um único. Agrupar reduz pouco — mas aí o que salva é a seleção em massa
 *     por filtro ("tudo que é 'Pix recebido' é Renda Extra") e a memória, que
 *     a partir do segundo mês reconhece os clientes recorrentes.
 *
 * Nenhuma das duas estratégias sozinha cobre os dois perfis; juntas, cobrem.
 * Por isso o agrupamento devolve os grupos ORDENADOS por quanto trabalho
 * economizam (mais lançamentos primeiro): resolver os 3 maiores grupos já
 * costuma dar conta da maior parte do extrato, seja qual for o perfil.
 */

/**
 * @param {Array} transacoes  já categorizadas
 * @returns {Array} grupos: {chave, descricaoExemplo, quantidade, total, tipo,
 *                  categoriaSugerida, confianca, precisaRevisao, indices}
 */
function agrupar(transacoes) {
  const grupos = new Map();

  transacoes.forEach((t, indice) => {
    // Lançamentos sem contraparte identificável (descrição virou vazia) ficam
    // sozinhos, para não virarem um balde gigante de coisas sem relação.
    const chave = t.chaveDeAprendizado || chaveDeAprendizado(t.descricao) || `__avulso_${indice}`;
    // Entrada e saída da MESMA contraparte são decisões diferentes: receber
    // do João é renda, pagar o João é despesa. Agrupar junto forçaria uma
    // categoria só para os dois sentidos.
    const id = `${t.tipo}|${chave}`;

    if (!grupos.has(id)) {
      grupos.set(id, {
        id,
        chave,
        tipo: t.tipo,
        descricaoExemplo: t.descricao,
        quantidade: 0,
        total: 0,
        categoriaSugerida: t.categoriaSugerida,
        confianca: t.confianca,
        ehTransferencia: t.ehTransferencia,
        indices: [],
      });
    }

    const g = grupos.get(id);
    g.quantidade += 1;
    g.total = Number((g.total + t.valor).toFixed(2));
    g.indices.push(indice);

    // A melhor confiança do grupo vale para todos: se uma linha foi
    // reconhecida pela memória, as irmãs herdam em vez de ficarem em Outros.
    if (ordemDeConfianca(t.confianca) > ordemDeConfianca(g.confianca)) {
      g.categoriaSugerida = t.categoriaSugerida;
      g.confianca = t.confianca;
    }
  });

  return [...grupos.values()]
    .map((g) => ({
      ...g,
      // O que a tela usa para decidir o que mostrar em destaque: grupo sem
      // categoria confiável é onde o usuário precisa olhar.
      precisaRevisao: g.confianca === 'padrao' || g.confianca === 'ia',
    }))
    .sort((a, b) => {
      // Quem precisa de revisão primeiro; dentro disso, o que economiza mais
      // trabalho (mais lançamentos) no topo.
      if (a.precisaRevisao !== b.precisaRevisao) return a.precisaRevisao ? -1 : 1;
      return b.quantidade - a.quantidade;
    });
}

const PESO = { historico: 3, regra: 2, ia: 1, padrao: 0 };
function ordemDeConfianca(confianca) {
  return PESO[confianca] ?? 0;
}

/**
 * Aplica a escolha do usuário a um grupo e devolve a lista atualizada.
 *
 * Chamado enquanto a pessoa revisa: classificar uma linha classifica todas as
 * irmãs na hora. É o que faz a primeira importação de um extrato cheio de
 * contrapartes novas ser tolerável — sem isso, o caso do extrato comercial
 * exigiria mais de cem decisões individuais.
 */
function aplicarNoGrupo(transacoes, indices, categoriaNome) {
  const alvo = new Set(indices);

  return transacoes.map((t, i) => (alvo.has(i)
    ? { ...t, categoriaSugerida: categoriaNome, confianca: 'usuario' }
    : t));
}

/**
 * O que a família aprende com esta importação: contraparte -> categoria
 * escolhida. Vira memória para a próxima importação, e é o que faz o sistema
 * melhorar com o uso em vez de perguntar as mesmas coisas todo mês.
 *
 * Só aprende com escolha do USUÁRIO ou memória já confirmada — palpite de IA
 * não vira memória, senão um erro do modelo se perpetua e contamina todos os
 * meses seguintes.
 */
function memoriaAprendida(transacoes) {
  const memoria = {};

  for (const t of transacoes) {
    if (t.confianca !== 'usuario' && t.confianca !== 'historico') continue;
    const chave = t.chaveDeAprendizado;
    if (!chave || !t.categoriaSugerida || t.categoriaSugerida === 'Outros') continue;
    memoria[chave] = t.categoriaSugerida;
  }

  return memoria;
}

/**
 * Sugestões de ação em massa, por TIPO DE OPERAÇÃO.
 *
 * Existe porque agrupar por contraparte não cobre todo perfil de extrato. Num
 * extrato de família as contrapartes se repetem e o agrupamento resolve; num
 * extrato com dezenas de pessoas diferentes (autônomo, conta comercial) cada
 * contraparte é única e o agrupamento não reduz nada — mas TODAS as linhas
 * compartilham o mesmo tipo de operação ("Transferência recebida pelo Pix").
 *
 * Medido no extrato real que motivou isto: 4 sugestões cobriam 121 de 131
 * lançamentos. É a diferença entre a pessoa tomar 4 decisões ou 105.
 *
 * O prefixo é o texto ANTES do nome da contraparte — o que o banco usa para
 * dizer que tipo de transação foi.
 */
function sugerirLotes(transacoes, { minimoPorLote = 3 } = {}) {
  const porPrefixo = new Map();

  transacoes.forEach((t, indice) => {
    const prefixo = prefixoDaOperacao(t.descricao);
    if (!prefixo) return;

    const id = `${t.tipo}|${prefixo}`;
    if (!porPrefixo.has(id)) {
      porPrefixo.set(id, { id, prefixo, tipo: t.tipo, quantidade: 0, total: 0, indices: [], pendentes: 0 });
    }

    const lote = porPrefixo.get(id);
    lote.quantidade += 1;
    lote.total = Number((lote.total + t.valor).toFixed(2));
    lote.indices.push(indice);
    if (t.confianca === 'padrao' || t.confianca === 'ia') lote.pendentes += 1;
  });

  return [...porPrefixo.values()]
    // Lote pequeno não vale uma sugestão: o usuário resolve mais rápido na mão.
    .filter((l) => l.quantidade >= minimoPorLote && l.pendentes > 0)
    .sort((a, b) => b.pendentes - a.pendentes);
}

/**
 * O rótulo que o banco põe antes do nome da contraparte.
 * "Transferência recebida pelo Pix - João" -> "Transferência recebida pelo Pix"
 *
 * Sem separador explícito, usa as primeiras palavras — extratos costumam
 * começar pelo tipo da operação ("PAGAMENTO FATURA", "COMPRA DEBITO").
 */
function prefixoDaOperacao(descricao) {
  const texto = String(descricao || '').trim();
  if (!texto) return null;

  const comSeparador = texto.split(/\s+-\s+/)[0].trim();
  if (comSeparador && comSeparador !== texto) return comSeparador;

  const palavras = texto.split(/\s+/);
  if (palavras.length <= 3) return texto;
  return palavras.slice(0, 3).join(' ');
}

module.exports = { agrupar, aplicarNoGrupo, memoriaAprendida, sugerirLotes, prefixoDaOperacao };
