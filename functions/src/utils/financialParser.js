/**
 * Parser de mensagens financeiras em texto livre.
 * Aceita formatos como:
 *   gasto mercado 84,90 pix
 *   receita serviço 250 pix
 *   despesa gasolina carro 150 credito
 *   entrada venda celular 800 dinheiro
 */

const PAYMENT_METHODS = ['pix', 'dinheiro', 'débito', 'debito', 'crédito', 'credito', 'boleto', 'transferência', 'transferencia', 'outro'];

const TYPE_KEYWORDS = {
  EXPENSE: ['gasto', 'despesa', 'paguei', 'pago', 'gastei', 'comprei', 'compra', 'pagar', 'gastando'],
  INCOME: ['receita', 'entrada', 'recebi', 'recebido', 'receber', 'ganhei', 'ganhou', 'deposito', 'depósito'],
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
    { keywords: ['almoço', 'almoco', 'lanche', 'jantar', 'comida', 'restaurante', 'pizza', 'hamburguer', 'café', 'cafe', 'ifood', 'delivery'], category: 'Alimentação' },
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

function detectAmount(words) {
  for (let i = words.length - 1; i >= 0; i--) {
    const word = words[i].replace(',', '.');
    const num = parseFloat(word);
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
    if (keywords.some((kw) => lower.includes(kw))) {
      return category;
    }
  }

  return type === 'EXPENSE' ? 'Outros' : 'Outros';
}

/**
 * Parseia uma mensagem de texto em um objeto de lançamento financeiro.
 * @param {string} message - Texto da mensagem
 * @returns {{ type, description, amount, paymentMethodName, categoryName, date, referenceMonth } | null}
 */
function parseFinancialMessage(message) {
  if (!message || typeof message !== 'string') return null;

  const trimmed = message.trim();
  const words = trimmed.split(/\s+/);

  if (words.length < 2) return null;

  const type = detectType(words[0]);
  if (!type) return null;

  // Remove a primeira palavra (tipo)
  let remainingWords = words.slice(1);

  // Detecta forma de pagamento (última palavra)
  const { method: paymentMethodName, remainingWords: wordsAfterPayment } = detectPaymentMethod(remainingWords);
  remainingWords = wordsAfterPayment;

  // Detecta valor numérico
  const { amount, remainingWords: wordsAfterAmount } = detectAmount(remainingWords);
  if (!amount) return null;

  // O que restou é a descrição
  const description = wordsAfterAmount.join(' ').trim();
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
    date,
    referenceMonth,
  };
}

module.exports = { parseFinancialMessage, suggestCategory };
