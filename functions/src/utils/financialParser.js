/**
 * Parser de mensagens financeiras em texto livre.
 * Aceita formatos como:
 *   gasto mercado 84,90 pix
 *   receita serviço 250 pix
 *   despesa gasolina carro 150 credito
 *   entrada venda celular 800 dinheiro
 */

const PAYMENT_METHODS = ['pix', 'dinheiro', 'débito', 'debito', 'crédito', 'credito', 'boleto', 'transferência', 'transferencia', 'outro'];

// Palavras que devem ser removidas da descrição (unidades monetárias, preposições comuns)
const IGNORED_WORDS = ['reais', 'real', 'r$', 'de', 'do', 'da', 'no', 'na'];

// "pagamento", "recebimento" e "ganho" são as formas em substantivo dos
// verbos que já estavam cobertos (paguei/pago, recebi/recebido, ganhei) —
// faltavam. Foi assim que "Pagamento cartão 1830" caía sem interpretar
// (ESTADO.md, sessão de 06/08/2026: falha real observada em teste).
const TYPE_KEYWORDS = {
  EXPENSE: ['gasto', 'despesa', 'paguei', 'pago', 'pagamento', 'gastei', 'comprei', 'compra', 'pagar', 'gastando', 'saída', 'saida'],
  INCOME: ['receita', 'entrada', 'recebi', 'recebido', 'recebimento', 'receber', 'ganhei', 'ganhou', 'ganho', 'deposito', 'depósito'],
};

const PAYMENT_METHOD_NORMALIZE = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  débito: 'Débito',
  debito: 'Débito',
  crédito: 'Crédito',
  credito: 'Crédito',
  boleto: 'Boleto',
  transferência: 'Transferência',
  transferencia: 'Transferência',
  outro: 'Outro',
};

// Mapeamento de palavras-chave para categorias
const CATEGORY_MAP = {
  EXPENSE: [
    { keywords: ['mercado', 'supermercado', 'compra', 'feira'], category: 'Mercado' },
    { keywords: ['gasolina', 'combustível', 'combustivel', 'posto', 'diesel', 'álcool', 'alcool'], category: 'Combustível' },
    { keywords: ['almoço', 'almoco', 'lanche', 'jantar', 'comida', 'restaurante', 'churrascaria', 'churrasco', 'lanchonete', 'padaria', 'açougue', 'acougue', 'pizza', 'hamburguer', 'café', 'cafe', 'ifood', 'delivery'], category: 'Alimentação' },
    { keywords: ['energia', 'luz', 'enel', 'celpe', 'copel'], category: 'Energia' },
    { keywords: ['água', 'agua', 'saneamento', 'compesa', 'sabesp'], category: 'Água' },
    { keywords: ['internet', 'wifi', 'net', 'vivo', 'claro', 'oi', 'tim'], category: 'Internet' },
    { keywords: ['remédio', 'remedio', 'farmácia', 'farmacia', 'droga', 'drogasil', 'ultrafarma'], category: 'Farmácia' },
    { keywords: ['uber', 'transporte', 'ônibus', 'onibus', 'metro', 'metrô', '99', 'taxi', 'táxi', 'passagem'], category: 'Transporte' },
    { keywords: ['igreja', 'oferta', 'dízimo', 'dizimo', 'doação', 'doacao'], category: 'Igreja/Doações' },
    { keywords: ['netflix', 'spotify', 'assinatura', 'prime', 'disney', 'youtube', 'globoplay'], category: 'Assinaturas' },
    { keywords: ['manutenção', 'manutencao', 'conserto', 'reparo', 'reforma'], category: 'Moradia' },
    { keywords: ['aluguel', 'condomínio', 'condominio', 'iptu', 'moradia'], category: 'Moradia' },
    { keywords: ['saúde', 'saude', 'médico', 'medico', 'consulta', 'exame', 'hospital', 'plano'], category: 'Saúde' },
    { keywords: ['escola', 'faculdade', 'curso', 'livro', 'educação', 'educacao', 'mensalidade'], category: 'Educação' },
    { keywords: ['cartão', 'cartao', 'fatura'], category: 'Cartão de Crédito' },
    { keywords: ['empréstimo', 'emprestimo', 'parcela', 'financiamento'], category: 'Empréstimos' },
  ],
  INCOME: [
    { keywords: ['salário', 'salario', 'pagamento', 'holerite'], category: 'Salário' },
    { keywords: ['serviço', 'servico', 'manutenção', 'manutencao', 'conserto', 'freela', 'freelance'], category: 'Serviços' },
    { keywords: ['venda', 'vendido', 'vendeu', 'vendi'], category: 'Vendas' },
    { keywords: ['reembolso', 'devolução', 'devolucao', 'estorno'], category: 'Reembolso' },
    { keywords: ['renda', 'extra', 'bico', 'aluguel recebido'], category: 'Renda Extra' },
  ],
};

/**
 * Casa uma palavra-chave como PALAVRA INTEIRA, não como pedaço de outra.
 *
 * Sem isso, 'net' casava dentro de 'netflix' (assinatura virava Internet) e
 * 'oi' casava dentro de 'foi'/'noite' (conversa comum acionava a IA à toa).
 *
 * Não dá para usar \b: em JS o \b só conhece [A-Za-z0-9_], então quebra em
 * palavra acentuada ('café,' não casaria). Usamos \p{L}/\p{N} com a flag u.
 * A fronteira só é aplicada do lado em que a palavra-chave começa/termina com
 * letra ou dígito — assim 'r$' ainda casa em 'r$50'.
 */
const _cacheRegex = new Map();

function regexPalavraInteira(palavra) {
  let regex = _cacheRegex.get(palavra);
  if (regex) return regex;

  const escapada = palavra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const comecaComLetraOuNumero = /[\p{L}\p{N}]/u.test(palavra[0]);
  const terminaComLetraOuNumero = /[\p{L}\p{N}]/u.test(palavra[palavra.length - 1]);

  const esquerda = comecaComLetraOuNumero ? '(?<![\\p{L}\\p{N}])' : '';
  const direita = terminaComLetraOuNumero ? '(?![\\p{L}\\p{N}])' : '';

  regex = new RegExp(`${esquerda}${escapada}${direita}`, 'u');
  _cacheRegex.set(palavra, regex);
  return regex;
}

function contemPalavra(texto, palavra) {
  return regexPalavraInteira(palavra).test(texto);
}

function detectType(firstWord) {
  const lower = firstWord.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.includes(lower)) return type;
  }
  return null;
}

function detectPaymentMethod(words) {
  const lastWord = words[words.length - 1]?.toLowerCase();
  if (PAYMENT_METHODS.includes(lastWord)) {
    return { method: PAYMENT_METHOD_NORMALIZE[lastWord], remainingWords: words.slice(0, -1) };
  }
  return { method: null, remainingWords: words };
}

// Converte um token em número respeitando o formato brasileiro.
// "1.500,00" → 1500.00 | "84,90" → 84.9 | "1.500" → 1500 | "1.5" → 1.5 | "R$50" → 50
function parseBrazilianAmount(raw) {
  let w = raw.toLowerCase().replace(/r?\$/g, '').trim();

  // Recusa número com letra colada. parseFloat('10x') devolve 10, e por causa
  // disso "geladeira 1200 em 10x" era lançada como R$ 10 em vez de R$ 1.200 —
  // o parser pegava o "10x" achando que era o valor da compra.
  if (!/^[\d.,]+$/.test(w)) return NaN;

  if (w.includes(',')) {
    // Vírgula é decimal; pontos são separadores de milhar
    w = w.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(w)) {
    // Apenas pontos em grupos de 3 dígitos → separador de milhar (ex: 1.500, 1.234.567)
    w = w.replace(/\./g, '');
  }
  return parseFloat(w);
}

function detectAmount(words) {
  for (let i = words.length - 1; i >= 0; i--) {
    const num = parseBrazilianAmount(words[i]);
    if (!isNaN(num) && num > 0) {
      return {
        amount: num,
        remainingWords: [...words.slice(0, i), ...words.slice(i + 1)],
      };
    }
  }
  return { amount: null, remainingWords: words };
}

function suggestCategory(description, type) {
  const lower = description.toLowerCase();
  const categoryList = CATEGORY_MAP[type] || [];

  for (const { keywords, category } of categoryList) {
    if (keywords.some((kw) => contemPalavra(lower, kw))) {
      return category;
    }
  }

  return type === 'EXPENSE' ? 'Outros' : 'Outros';
}

/**
 * Parseia uma mensagem de texto em um objeto de lançamento financeiro.
 * @param {string} message - Texto da mensagem
 * @param {string[]} payers - Lista de nomes dos pagadores configurados (ex: ['Kirk', 'Raquel'])
 * @returns {{ type, description, amount, paymentMethodName, categoryName, paidBy, date, referenceMonth } | null}
 */
function parseFinancialMessage(message, payers = []) {
  if (!message || typeof message !== 'string') return null;

  const trimmed = message.trim();
  const words = trimmed.split(/\s+/);

  if (words.length < 2) return null;

  const type = detectType(words[0]);
  if (!type) return null;

  // Remove a primeira palavra (tipo)
  let remainingWords = words.slice(1);

  // Detecta pagador no final se houver nomes configurados
  // Exemplo: "gasto mercado 84,90 pix raquel" → paidBy = "Raquel"
  // Aceita payers como array de strings OU objetos {name, phone}
  let paidBy = null;
  const payerNames = payers.map((p) => (typeof p === 'string' ? p : p.name));

  // Tenta detectar nome do pagador na última palavra (antes do pagamento)
  if (payerNames.length > 0) {
    const lastWord = remainingWords[remainingWords.length - 1]?.toLowerCase();
    const matchedPayer = payerNames.find((p) => p.toLowerCase() === lastWord);
    if (matchedPayer) {
      paidBy = matchedPayer;
      remainingWords = remainingWords.slice(0, -1);
    }
  }

  // Detecta forma de pagamento (última palavra)
  const { method: paymentMethodName, remainingWords: wordsAfterPayment } = detectPaymentMethod(remainingWords);
  remainingWords = wordsAfterPayment;

  // Detecta valor numérico
  const { amount, remainingWords: wordsAfterAmount } = detectAmount(remainingWords);
  if (!amount) return null;

  // O que restou é a descrição
  let description = wordsAfterAmount.join(' ').trim();
  if (!description) return null;

  // Se o nome não foi encontrado antes, procura em QUALQUER posição da descrição
  // Ex: "mercado café da manhã Raquel" → paidBy=Raquel, desc="mercado café da manhã"
  if (!paidBy && payerNames.length > 0) {
    const descWords = description.split(' ');
    for (let i = 0; i < descWords.length; i++) {
      const match = payerNames.find((p) => p.toLowerCase() === descWords[i].toLowerCase());
      if (match) {
        paidBy = match;
        description = [...descWords.slice(0, i), ...descWords.slice(i + 1)].join(' ').trim();
        break;
      }
    }
  }

  // Remove palavras ignoradas da descrição (ex: "reais", "de", "da")
  description = description
    .split(' ')
    .filter(w => !IGNORED_WORDS.includes(w.toLowerCase()))
    .join(' ')
    .trim();

  if (!description) return null;

  const categoryName = suggestCategory(description, type);

  const now = new Date();
  const date = now;
  const referenceMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return {
    type,
    description,
    amount,
    paymentMethodName,
    categoryName,
    paidBy,
    date,
    referenceMonth,
  };
}

// Pistas de que uma linha PODE ser um lançamento financeiro (não exige começar com tipo).
// Usado como gatilho leve antes de tentar o parser/IA — evita acionar a IA em conversa comum.
const FINANCIAL_HINTS = [
  ...TYPE_KEYWORDS.EXPENSE,
  ...TYPE_KEYWORDS.INCOME,
  ...PAYMENT_METHODS,
  'reais', 'real', 'r$', 'pila', 'conto', 'paguei', 'pagamento', 'conta', 'comprei',
  // palavras de categoria (mercado, uber, gasolina, ifood...) reforçam a detecção
  ...Object.values(CATEGORY_MAP).flat().flatMap((c) => c.keywords),
];

/**
 * Decide se vale a pena tentar interpretar a linha como lançamento financeiro.
 * Critério: precisa conter um número E alguma pista financeira como palavra
 * inteira, em qualquer posição.
 *
 * Não exige que a mensagem COMECE com palavra-chave — assim "uber 23 pix" e
 * "fiz um pix de 50 no mercado" passam. Mas exige palavra inteira, senão
 * "boa noite, chego 22h" acionaria a IA por causa do 'oi' dentro de 'noite'.
 */
function looksLikeFinancialMessage(text) {
  if (!text) return false;
  const lower = text.trim().toLowerCase();
  if (!/\d/.test(lower)) return false;
  return FINANCIAL_HINTS.some((hint) => contemPalavra(lower, hint));
}

module.exports = {
  parseFinancialMessage,
  suggestCategory,
  looksLikeFinancialMessage,
  parseBrazilianAmount,
  contemPalavra,
};
