const { normalizar } = require('./normalizarTexto');

/**
 * A pergunta dá para responder SEM IA?
 *
 * Função PURA — sem banco, sem rede — para poder ser exercitada com centenas
 * de frases reais em teste de unidade.
 *
 * POR QUE ISTO EXISTE
 *
 * Medido em 19/08/2026: 96,5% do que se paga numa pergunta é estrutura fixa
 * (instrução + catálogo de 13 ferramentas), reenviada a cada uma das ~2,8
 * rodadas. O dado financeiro em si são ~271 tokens. Ou seja, o produto pagava
 * modelo de linguagem caro para responder "quanto gastei no mercado" — uma
 * soma que o sistema já sabe fazer de graça, na hora, e sem errar.
 *
 * Aqui a pergunta vira uma intenção com parâmetros. Quem executa é o
 * `consultaDiretaService`, chamando as MESMAS funções de agregação que a IA
 * chamaria (`consultaFinanceiraService`) — nada de agregação nova, nada de
 * número calculado por modelo.
 *
 * A REGRA DE OURO: NA DÚVIDA, DEVOLVE `null`.
 *
 * `null` significa "não sei, manda para a IA" — que é o comportamento de
 * hoje, e portanto nunca é uma regressão. Este módulo só pode responder o que
 * reconhece com CERTEZA. Lista fechada de palavras-chave já falhou duas vezes
 * neste projeto (o `CATEGORY_MAP` mandando estabelecimento real para "Outros",
 * e a lista de aberturas de pergunta engolindo "detalhe os gastos"), e nas
 * duas o erro foi caro porque a falha era SILENCIOSA. Aqui o erro cai do lado
 * seguro: gasta-se uma chamada de IA que talvez fosse evitável. Nunca se
 * responde errado, e nunca se cala.
 */

const INTENCAO = {
  IDENTIDADE: 'IDENTIDADE',
  RESUMO_MES: 'RESUMO_MES',
  GASTO_CATEGORIA: 'GASTO_CATEGORIA',
  POR_CATEGORIA: 'POR_CATEGORIA',
  COMPARATIVO: 'COMPARATIVO',
  MAIOR_GASTO: 'MAIOR_GASTO',
  LISTAR_LANCAMENTOS: 'LISTAR_LANCAMENTOS',
  POR_PESSOA: 'POR_PESSOA',
};

const MESES = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * Palavras que provam que a pergunta NÃO é sobre um mês fechado.
 *
 * As agregações existentes trabalham por mês. "Essa semana", "ontem", "nos
 * últimos 15 dias" precisam de recorte que elas não fazem — então a pergunta
 * inteira vai para a IA, que tem `listarLancamentos` e sabe filtrar. Sem esta
 * barreira, "quanto gastei no mercado essa semana?" seria respondido com o
 * total do MÊS: número errado com cara de certo, que é o pior resultado
 * possível num app de dinheiro.
 */
const RECORTE_QUE_NAO_SEI_FAZER = [
  'semana', 'semanal', 'ontem', 'hoje', 'anteontem', 'amanha',
  'dia ', 'dias', 'quinzena', 'ano', 'anual', 'trimestre', 'semestre',
  'hora', 'agora', 'fim de semana', 'feriado',
];

/**
 * Sinais de que a pessoa quer CONSELHO, não número.
 *
 * Conselho é o que justifica existir uma assistente — vai para a IA sempre,
 * mesmo que a frase também cite uma categoria. "Como economizar em mercado?"
 * não é a mesma pergunta que "quanto gastei em mercado?".
 */
const PEDE_CONSELHO = [
  'como posso', 'como faco', 'como faço', 'como fazer', 'como reduzir',
  'como economizar', 'como diminuir', 'como aumentar', 'como melhorar',
  'o que voce acha', 'o que acha', 'me ajuda a', 'me aconselha', 'aconselha',
  'vale a pena', 'devo ', 'deveria', 'sugere', 'sugestao', 'dica', 'dicas',
  'estrategia', 'plano', 'meta', 'objetivo', 'consigo ', 'da pra ',
  'sera que', 'por que', 'porque', 'pq ', 'motivo', 'explica por',
  'esta bom', 'ta bom', 'esta muito', 'ta muito', 'esta alto', 'ta alto',
  'e normal', 'e muito', 'e pouco', 'preciso',
];

/** Aritmética sobre o número — a IA faz, a camada direta não. */
const PEDE_CONTA = ['%', 'por cento', 'porcento', 'metade', 'dobro', 'media', 'média'];

function limpar(texto) {
  return normalizar(texto).replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function contem(texto, lista) {
  return lista.some((termo) => texto.includes(termo));
}

/** AAAA-MM deslocado em N meses. */
function deslocarMes(mes, quantos) {
  const [ano, m] = String(mes).split('-').map(Number);
  const d = new Date(Date.UTC(ano, m - 1 + quantos, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Que mês a frase está pedindo?
 *
 * @returns {string|undefined|null} AAAA-MM; `undefined` = não disse (usa o
 *   corrente); `null` = disse algo que eu não sei traduzir, então a pergunta
 *   inteira precisa ir para a IA.
 */
function extrairMes(texto, mesCorrente) {
  if (contem(texto, ['mes passado', 'mes anterior', 'ultimo mes'])) {
    return deslocarMes(mesCorrente, -1);
  }
  if (contem(texto, ['mes retrasado'])) return deslocarMes(mesCorrente, -2);

  // AAAA-MM escrito na frase.
  const explicito = texto.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/);
  if (explicito) {
    return `${explicito[1]}-${String(Number(explicito[2])).padStart(2, '0')}`;
  }

  const nomeado = MESES.findIndex((m) => texto.includes(m));
  if (nomeado >= 0) {
    const [anoCorrente, mesNumero] = mesCorrente.split('-').map(Number);
    // Mês que ainda não chegou é do ano passado — "compare com dezembro" em
    // agosto é o dezembro que passou, não o que vem.
    const ano = (nomeado + 1) > mesNumero ? anoCorrente - 1 : anoCorrente;
    return `${ano}-${String(nomeado + 1).padStart(2, '0')}`;
  }

  if (contem(texto, ['esse mes', 'este mes', 'do mes', 'no mes', 'mes atual', 'mensal'])) {
    return undefined;
  }

  return undefined;
}

/**
 * A frase cita uma categoria que a família tem cadastrada?
 *
 * Casa pelo nome real, vindo do banco — não por lista fixa. É a diferença
 * entre isto e o `CATEGORY_MAP`, que envelheceu mal justamente por ser fixo.
 * Nome mais longo primeiro, para "Cartão de Crédito" ganhar de "Cartão".
 */
function extrairCategoria(texto, categorias) {
  const candidatas = [...(categorias || [])]
    .filter(Boolean)
    .sort((a, b) => String(b).length - String(a).length);

  for (const nome of candidatas) {
    const alvo = normalizar(nome);
    if (!alvo) continue;
    // Fronteira de palavra: "net" não pode casar dentro de "internet".
    if (new RegExp(`(^|\\s)${alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(texto)) {
      return nome;
    }
  }
  return null;
}

/**
 * A pergunta é sobre QUEM gastou?
 *
 * Só esta intenção aceita recorte em dias, porque só ela tem agregação que
 * sabe fazer isso (`gastoPorPessoa`). As outras continuam sendo mensais, e a
 * barreira de recorte segue valendo para elas.
 */
function pedePorPessoa(texto) {
  return contem(texto, [
    'por pessoa', 'por usuario', 'por membro', 'cada pessoa', 'cada um',
    'cada membro', 'quem gastou', 'quem mais gastou', 'quem gasta',
    'separado por pessoa', 'separado por usuario', 'separado por membro',
    'de cada um', 'por integrante', 'entre nos', 'quem foi que gastou',
  ]);
}

/**
 * Recorte em dias a partir de HOJE.
 *
 * Só formas que se traduzem sem ambiguidade em "os últimos N dias". "Ontem"
 * fica de fora de propósito: é UM dia específico, não uma janela até hoje, e
 * responder "últimos 2 dias" a quem pediu ontem incluiria hoje — número errado
 * com cara de certo, que é o erro que esta camada existe para não cometer.
 *
 * @returns {number|null} null = sem recorte em dias (usa o mês)
 */
function extrairDias(texto) {
  if (contem(texto, ['hoje', 'do dia de hoje'])) return 1;
  if (contem(texto, ['essa semana', 'esta semana', 'na semana', 'da semana',
    'ultimos 7 dias', 'ultima semana', 'semana atual'])) return 7;
  if (contem(texto, ['ultimos 15 dias', 'ultimos quinze dias', 'quinzena'])) return 15;
  if (contem(texto, ['ultimos 30 dias', 'ultimos trinta dias'])) return 30;

  const explicito = texto.match(/ultimos?\s+(\d{1,2})\s+dias?/);
  if (explicito) {
    const n = Number(explicito[1]);
    if (n >= 1 && n <= 62) return n;
  }

  return null;
}

/**
 * Quantos meses distintos a frase cita?
 *
 * "compara agosto com julho" cita dois, e aí decidir qual é a base e qual é o
 * alvo exige entender a frase — trabalho de IA, não de regra.
 */
function contarMesesCitados(texto) {
  const nomeados = MESES.filter((m) => texto.includes(m)).length;
  const explicitos = (texto.match(/\b20\d{2}[-/](0?[1-9]|1[0-2])\b/g) || []).length;
  const relativos = ['mes passado', 'mes anterior', 'mes retrasado', 'ultimo mes']
    .filter((t) => texto.includes(t)).length;

  return nomeados + explicitos + relativos;
}

/**
 * Palavras que podem seguir "em/no/na/com" sem serem um alvo de gasto.
 * Tudo que NÃO estiver aqui e não for categoria conhecida é assunto que eu
 * não sei tratar.
 */
const ALVO_NEUTRO = new Set([
  ...MESES,
  'total', 'geral', 'tudo', 'media', 'mes', 'meses', 'casa', 'familia',
  'relacao', 'comparacao', 'dinheiro', 'reais', 'conta', 'contas',
]);

const ARTIGOS = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'meu', 'minha', 'meus', 'minhas']);

/**
 * A frase aponta para um assunto específico que eu NÃO reconheci?
 *
 * Esta é a barreira mais importante do módulo. Sem ela, "quanto gastei no
 * mercado esse mês?" numa família que não tem a categoria "Mercado" caía no
 * resumo e respondia com o total do MÊS INTEIRO — a pessoa perguntou de uma
 * coisa e recebeu outra, com número exato e conclusão errada. Foi achado por
 * teste antes de ir para produção.
 *
 * Só é consultada quando nenhuma categoria casou, que é justamente o caso
 * perigoso.
 */
function temAlvoDesconhecido(texto) {
  const palavras = texto.split(' ');

  for (let i = 0; i < palavras.length - 1; i += 1) {
    if (!['em', 'no', 'na', 'nos', 'nas', 'com', 'pra', 'para'].includes(palavras[i])) continue;

    // Pula artigo e possessivo: "no meu mercado" aponta para "mercado".
    let j = i + 1;
    while (j < palavras.length && ARTIGOS.has(palavras[j])) j += 1;
    if (j >= palavras.length) continue;

    const alvo = palavras[j].replace(/[^\p{L}]/gu, '');
    if (!alvo || alvo.length < 3) continue;
    if (!ALVO_NEUTRO.has(alvo)) return true;
  }

  return false;
}

/**
 * Classifica a pergunta.
 *
 * @param {string} texto
 * @param {{categorias?: string[], mesCorrente: string, nomeDaIA?: string}} ctx
 * @returns {{intencao: string, parametros: object}|null} `null` = manda para a IA
 */
function rotearConsulta(texto, { categorias = [], mesCorrente, nomeDaIA = 'Nina' } = {}) {
  const limpo = limpar(texto);
  if (!limpo || !mesCorrente) return null;

  // "Qual seu nome?" custa uma chamada de IA hoje. É a pergunta mais barata
  // possível de responder e não tem nada a ver com finanças.
  if (contem(limpo, ['qual seu nome', 'qual e seu nome', 'qual o seu nome',
    'como voce se chama', 'como se chama', 'quem e voce', 'quem es tu'])) {
    return { intencao: INTENCAO.IDENTIDADE, parametros: { nomeDaIA } };
  }

  // Daqui para baixo é número. Conselho e aritmética são da IA.
  if (contem(limpo, PEDE_CONSELHO)) return null;
  if (contem(limpo, PEDE_CONTA)) return null;

  // "Quem gastou" vem ANTES da barreira de recorte: é a única intenção com
  // agregação que sabe recortar em dias.
  if (pedePorPessoa(limpo)) {
    const dias = extrairDias(limpo);
    const mesPedido = extrairMes(limpo, mesCorrente);
    if (mesPedido === null) return null;

    // Sem recorte em dias e com palavra de tempo que não sei traduzir
    // ("ontem", "esse ano"), a pergunta inteira vai para a IA.
    if (!dias && contem(limpo, RECORTE_QUE_NAO_SEI_FAZER)) return null;

    const categoria = extrairCategoria(limpo, categorias);
    return {
      intencao: INTENCAO.POR_PESSOA,
      parametros: dias
        ? { dias, categoria: categoria || undefined }
        : { mes: mesPedido, categoria: categoria || undefined },
    };
  }

  if (contem(limpo, RECORTE_QUE_NAO_SEI_FAZER)) return null;

  const mes = extrairMes(limpo, mesCorrente);
  if (mes === null) return null;

  const categoria = extrairCategoria(limpo, categorias);
  const perguntaValor = contem(limpo, ['quanto', 'total', 'somei', 'soma ', 'gastei', 'gasto', 'gastos', 'gastamos']);

  // Comparação entre dois meses.
  //
  // O mês citado é o de REFERÊNCIA (`mesA`), e o comparado é o corrente:
  // "compare com o mês passado" = julho contra agosto, não julho contra julho.
  // A primeira versão passava o mês citado como `mesB`, e como `mesA` cai no
  // padrão "mês anterior ao corrente", o resultado em produção foi "julho de
  // 2026 contra julho de 2026 — diferença R$ 0,00". Achado no teste ao vivo
  // de 20/08/2026.
  //
  // Frase com DOIS meses ("compara agosto com julho") vai para a IA: saber
  // qual é a base e qual é o alvo exige entender a frase, não achar palavras.
  if (contem(limpo, ['compar', 'versus', ' vs ', 'diferenca entre', 'em relacao ao mes',
    'subiu', 'aumentou', 'diminuiu', 'caiu', 'que mes gastei mais'])) {
    if (contarMesesCitados(limpo) > 1) return null;
    // Sem mês citado, compara com o anterior — que é o que "compare" sozinho
    // quer dizer.
    const referencia = mes === undefined ? deslocarMes(mesCorrente, -1) : mes;
    if (referencia === mesCorrente) return null;
    return { intencao: INTENCAO.COMPARATIVO, parametros: { mesA: referencia, mesB: mesCorrente } };
  }

  // Onde o dinheiro está indo.
  if (contem(limpo, ['gastando demais', 'gasto demais', 'maior gasto', 'maiores gastos',
    'onde estou gastando', 'onde gasto', 'maior categoria', 'que mais gasto',
    'que mais gastei', 'onde vai meu dinheiro', 'onde foi meu dinheiro'])) {
    return { intencao: INTENCAO.MAIOR_GASTO, parametros: { mes } };
  }

  // Quebra do mês inteiro por categoria.
  if (contem(limpo, ['por categoria', 'nas categorias', 'entre categorias', 'cada categoria',
    'abre o mes', 'abre agosto', 'divisao por categoria', 'distribuicao'])
    && !categoria) {
    return { intencao: INTENCAO.POR_CATEGORIA, parametros: { mes } };
  }

  // Uma categoria específica: total ou detalhe.
  if (categoria) {
    const querLista = contem(limpo, ['detalh', 'quais', 'lista', 'listar', 'mostra os',
      'me mostra', 'lancamentos', 'compras', 'itens', 'o que foi', 'o que comprei']);

    if (querLista) {
      return { intencao: INTENCAO.LISTAR_LANCAMENTOS, parametros: { mes, categoria } };
    }
    if (perguntaValor) {
      return { intencao: INTENCAO.GASTO_CATEGORIA, parametros: { mes, categoria } };
    }
    return null;
  }

  // Resumo do mês, sem categoria nenhuma citada.
  //
  // Só chega aqui quem NÃO citou categoria conhecida. Se a frase aponta para
  // algum outro assunto ("no mercado" numa família sem essa categoria), o
  // resumo responderia o total do mês — outra pergunta, com número exato e
  // conclusão errada. Nesse caso é a IA que atende.
  if (temAlvoDesconhecido(limpo)) return null;

  if (perguntaValor && contem(limpo, ['esse mes', 'este mes', 'do mes', 'no mes',
    'mes passado', 'mes atual', 'no total', 'ao todo', 'total'])) {
    return { intencao: INTENCAO.RESUMO_MES, parametros: { mes } };
  }
  if (contem(limpo, ['resumo do mes', 'resumo mensal', 'como foi o mes', 'balanco',
    'meu saldo', 'qual o saldo', 'quanto sobrou', 'quanto sobra'])) {
    return { intencao: INTENCAO.RESUMO_MES, parametros: { mes } };
  }

  return null;
}

module.exports = {
  rotearConsulta,
  INTENCAO,
  deslocarMes,
  // Exportados para teste: são as barreiras que impedem resposta errada.
  extrairMes,
  extrairCategoria,
  temAlvoDesconhecido,
  extrairDias,
  pedePorPessoa,
  RECORTE_QUE_NAO_SEI_FAZER,
  PEDE_CONSELHO,
};
