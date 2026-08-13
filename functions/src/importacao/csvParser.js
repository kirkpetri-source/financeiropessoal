/**
 * Leitor de extrato CSV, com detecção automática de colunas.
 *
 * Existe porque nem todo banco entrega OFX para conta de pessoa física — e
 * quando entrega, muita gente baixa o CSV por ser o que aparece primeiro no
 * app. Sem isso, "importe seu extrato" só funcionaria para parte dos clientes.
 *
 * A decisão de projeto importante: **não existe um parser por banco**. Cada
 * banco muda o layout do CSV sem avisar, e uma lista de layouts fixos vira
 * manutenção eterna e quebra em silêncio no dia em que o Nubank inverte duas
 * colunas. Em vez disso, as colunas são descobertas pelo CONTEÚDO: a coluna
 * cujas células parecem data é a data, a que parece dinheiro é o valor, a que
 * tem o texto mais longo é a descrição. Isso funciona igual para Nubank, Itaú,
 * BB, Inter, C6 e para o CSV que o cliente montou na mão no Excel.
 */

const { lerDataBR, pareceData } = require('./datas');

/** Cabeçalhos conhecidos, usados como pista — nunca como exigência. */
const PISTAS = {
  data: ['data', 'date', 'data lancamento', 'data lançamento', 'dt', 'data movimento', 'data da compra'],
  valor: ['valor', 'value', 'amount', 'quantia', 'vlr', 'valor (r$)', 'montante'],
  descricao: ['descricao', 'descrição', 'description', 'historico', 'histórico', 'lancamento',
    'lançamento', 'detalhes', 'memo', 'estabelecimento', 'titulo', 'título'],
  // Alguns bancos separam entrada e saída em duas colunas em vez de usar sinal.
  entrada: ['credito', 'crédito', 'entrada', 'receita', 'credit'],
  saida: ['debito', 'débito', 'saida', 'saída', 'despesa', 'debit'],
  identificador: ['identificador', 'id', 'fitid', 'documento', 'doc', 'numero do documento'],
};

const SEPARADORES = [',', ';', '\t', '|'];

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * Divide uma linha de CSV respeitando aspas.
 *
 * Feito à mão em vez de `split(sep)` porque descrição de banco tem vírgula
 * dentro com frequência ("PAG*MERCADO, LTDA") — o split cru quebraria a
 * linha no meio do texto e jogaria metade da descrição na coluna do valor.
 */
function dividirLinha(linha, separador) {
  const celulas = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];

    if (c === '"') {
      // Aspas duplas escapadas ("") viram uma aspas literal.
      if (dentroDeAspas && linha[i + 1] === '"') { atual += '"'; i += 1; }
      else dentroDeAspas = !dentroDeAspas;
      continue;
    }

    if (c === separador && !dentroDeAspas) { celulas.push(atual); atual = ''; continue; }
    atual += c;
  }

  celulas.push(atual);
  return celulas.map((c) => c.trim());
}

/** O separador certo é o que produz mais colunas de forma CONSISTENTE entre as linhas. */
function detectarSeparador(linhas) {
  let melhor = { separador: ',', colunas: 0 };

  for (const separador of SEPARADORES) {
    const contagens = linhas.slice(0, 10).map((l) => dividirLinha(l, separador).length);
    if (!contagens.length) continue;

    const media = contagens.reduce((a, b) => a + b, 0) / contagens.length;
    const consistente = contagens.every((c) => c === contagens[0]);

    if (media > 1 && consistente && media > melhor.colunas) {
      melhor = { separador, colunas: media };
    }
  }

  return melhor.separador;
}

/**
 * Lê dinheiro em formato brasileiro OU americano.
 *
 * O desafio é que `1.234` é mil duzentos e trinta e quatro no Brasil e
 * 1,234 nos EUA. A regra usada: se tem vírgula, a vírgula é o decimal
 * (formato BR) e o ponto é milhar. Se só tem ponto, olha quantas casas vêm
 * depois — duas casas é decimal (`84.90`), três é milhar (`1.234`).
 */
function lerValor(bruto) {
  if (bruto == null || bruto === '') return null;

  let texto = String(bruto).trim();
  const negativoPorParenteses = /^\(.*\)$/.test(texto); // (84,90) = -84,90 em alguns exports
  texto = texto.replace(/[()]/g, '');

  const negativo = negativoPorParenteses || texto.includes('-');
  texto = texto.replace(/[^0-9.,]/g, '');
  if (!texto) return null;

  const temVirgula = texto.includes(',');
  const temPonto = texto.includes('.');

  if (temVirgula && temPonto) {
    // O que vier por último é o decimal.
    texto = texto.lastIndexOf(',') > texto.lastIndexOf('.')
      ? texto.replace(/\./g, '').replace(',', '.')
      : texto.replace(/,/g, '');
  } else if (temVirgula) {
    texto = texto.replace(',', '.');
  } else if (temPonto) {
    const depois = texto.split('.').pop();
    if (depois.length === 3 && texto.split('.')[0].length <= 3) texto = texto.replace(/\./g, '');
  }

  const n = Number(texto);
  if (!Number.isFinite(n)) return null;
  return negativo ? -Math.abs(n) : n;
}

function pareceValor(bruto) {
  if (bruto == null || bruto === '') return false;
  // Precisa ter dígito e não pode ser uma data disfarçada de número.
  if (!/\d/.test(String(bruto))) return false;
  if (pareceData(bruto)) return false;
  return lerValor(bruto) !== null;
}

/**
 * Descobre o papel de cada coluna, primeiro pelo cabeçalho e depois — o que
 * de fato importa — pelo conteúdo das linhas. O conteúdo tem a palavra final
 * porque cabeçalho mente: tem banco que chama a coluna de valor de "Valor" e
 * tem banco que chama de "Valor (R$)" ou nem põe cabeçalho.
 */
function detectarColunas(cabecalho, linhas) {
  const total = cabecalho.length;
  const papel = {};

  cabecalho.forEach((nome, i) => {
    const n = normalizar(nome);
    for (const [campo, pistas] of Object.entries(PISTAS)) {
      if (pistas.some((p) => n === p || n.includes(p))) {
        if (papel[campo] === undefined) papel[campo] = i;
      }
    }
  });

  // Pontuação por conteúdo, coluna a coluna.
  const amostra = linhas.slice(0, 30);
  const perfil = [];

  for (let i = 0; i < total; i++) {
    const celulas = amostra.map((l) => l[i]).filter((c) => c != null && c !== '');
    if (!celulas.length) { perfil.push({ datas: 0, valores: 0, texto: 0 }); continue; }

    perfil.push({
      datas: celulas.filter(pareceData).length / celulas.length,
      valores: celulas.filter(pareceValor).length / celulas.length,
      texto: celulas.reduce((soma, c) => soma + String(c).length, 0) / celulas.length,
    });
  }

  // A coluna de data é a que tem mais células com cara de data.
  if (papel.data === undefined || perfil[papel.data]?.datas < 0.5) {
    const melhor = perfil.map((p, i) => ({ i, v: p.datas }))
      .filter((x) => x.v >= 0.5).sort((a, b) => b.v - a.v)[0];
    if (melhor) papel.data = melhor.i;
  }

  // Valor: entre as colunas numéricas, a que NÃO é a data.
  if (papel.valor === undefined && papel.entrada === undefined) {
    const candidatas = perfil.map((p, i) => ({ i, v: p.valores }))
      .filter((x) => x.i !== papel.data && x.v >= 0.6)
      .sort((a, b) => b.v - a.v);
    if (candidatas.length) papel.valor = candidatas[0].i;
  }

  // Descrição: a coluna de texto mais longa que não é data nem valor.
  if (papel.descricao === undefined) {
    const candidatas = perfil.map((p, i) => ({ i, ...p }))
      .filter((x) => x.i !== papel.data && x.i !== papel.valor && x.datas < 0.5 && x.valores < 0.5)
      .sort((a, b) => b.texto - a.texto);
    if (candidatas.length) papel.descricao = candidatas[0].i;
  }

  return papel;
}

/**
 * A primeira linha é cabeçalho ou já é lançamento?
 *
 * Se ela tiver data ou valor de verdade, é dado — arquivo sem cabeçalho
 * existe, e tratar a primeira transação como título faria o cliente perder
 * um lançamento em silêncio.
 */
function primeiraLinhaEhCabecalho(celulas) {
  const temDadoDeVerdade = celulas.some((c) => pareceData(c)) || celulas.filter(pareceValor).length >= 1;
  return !temDadoDeVerdade;
}

function ehCsv(conteudo) {
  if (!conteudo || typeof conteudo !== 'string') return false;
  const linhas = conteudo.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return false;
  return SEPARADORES.some((s) => dividirLinha(linhas[0], s).length > 1);
}

/**
 * Lê o CSV e devolve transações normalizadas — mesmo formato de saída do
 * leitor de OFX, para o resto do sistema não precisar saber de qual arquivo
 * veio.
 *
 * @returns {{transacoes: Array, ignoradas: number, colunas: object}}
 */
function lerCsv(conteudo) {
  const linhasBrutas = conteudo.split(/\r?\n/).filter((l) => l.trim());
  if (linhasBrutas.length < 2) {
    throw Object.assign(new Error('Arquivo vazio ou sem lançamentos.'), { statusCode: 400 });
  }

  const separador = detectarSeparador(linhasBrutas);
  const todas = linhasBrutas.map((l) => dividirLinha(l, separador));

  const temCabecalho = primeiraLinhaEhCabecalho(todas[0]);
  const cabecalho = temCabecalho ? todas[0] : todas[0].map((_, i) => `coluna${i}`);
  const corpo = temCabecalho ? todas.slice(1) : todas;

  const colunas = detectarColunas(cabecalho, corpo);

  if (colunas.data === undefined) {
    throw Object.assign(
      new Error('Não encontrei uma coluna de data neste arquivo. Confira se é mesmo um extrato.'),
      { statusCode: 400, codigo: 'SEM_COLUNA_DATA' },
    );
  }
  if (colunas.valor === undefined && colunas.entrada === undefined && colunas.saida === undefined) {
    throw Object.assign(
      new Error('Não encontrei uma coluna de valor neste arquivo. Confira se é mesmo um extrato.'),
      { statusCode: 400, codigo: 'SEM_COLUNA_VALOR' },
    );
  }

  const transacoes = [];
  let ignoradas = 0;

  for (const celulas of corpo) {
    const data = lerDataBR(celulas[colunas.data]);

    // Banco que separa entrada e saída em colunas diferentes: o valor é o
    // que estiver preenchido, e a coluna decide o sinal.
    let valor = null;
    if (colunas.valor !== undefined) {
      valor = lerValor(celulas[colunas.valor]);
    } else {
      const entrada = colunas.entrada !== undefined ? lerValor(celulas[colunas.entrada]) : null;
      const saida = colunas.saida !== undefined ? lerValor(celulas[colunas.saida]) : null;
      if (entrada) valor = Math.abs(entrada);
      else if (saida) valor = -Math.abs(saida);
    }

    const descricao = colunas.descricao !== undefined ? String(celulas[colunas.descricao] || '').trim() : '';

    if (!data || valor == null || valor === 0 || !descricao) { ignoradas += 1; continue; }

    transacoes.push({
      data,
      descricao,
      tipo: valor < 0 ? 'EXPENSE' : 'INCOME',
      valor: Math.abs(valor),
      idDoBanco: colunas.identificador !== undefined
        ? String(celulas[colunas.identificador] || '').trim() || null
        : null,
      documento: null,
      tipoDoBanco: null,
    });
  }

  return { transacoes, ignoradas, colunas: { ...colunas, separador, temCabecalho } };
}

module.exports = { lerCsv, ehCsv, lerValor, pareceValor, dividirLinha, detectarSeparador, detectarColunas };
