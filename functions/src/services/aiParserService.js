/**
 * Fallback de IA para interpretar mensagens financeiras em linguagem natural.
 * Acionado quando o parser por regras (financialParser) não consegue interpretar.
 *
 * Usa o Gemini 2.0 Flash via REST (sem dependência extra — fetch nativo do Node 22).
 * A chave vem do secret GEMINI_API_KEY (process.env.GEMINI_API_KEY).
 */

// gemini-2.0-flash foi desligado pelo Google em 01/06/2026 — descoberto em
// 08/08/2026 quando o parser de mídia (áudio/cupom) começou a falhar com
// 429; o texto provavelmente já estava quebrado silenciosamente desde então
// (cai no parser por regras primeiro, então nem sempre aparecia).
const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const VALID_CATEGORIES = [
  'Mercado', 'Combustível', 'Alimentação', 'Energia', 'Água', 'Internet',
  'Farmácia', 'Transporte', 'Igreja/Doações', 'Assinaturas', 'Moradia',
  'Saúde', 'Educação', 'Cartão de Crédito', 'Empréstimos',
  'Salário', 'Serviços', 'Vendas', 'Reembolso', 'Renda Extra', 'Outros',
];

const VALID_PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Boleto', 'Transferência', 'Outro'];

// Prompt construído com o prompt-mestre (alvo: Gemini 2.0 Flash).
// Trava de formato + exemplo rotulado + ancoragem (Gemini desvia de formatos estritos sem isso).
const SYSTEM_PROMPT = `Você é um extrator de lançamentos financeiros de mensagens de WhatsApp em português do Brasil (linguagem informal). Sua ÚNICA função é converter a mensagem do usuário em JSON.

DEVE retornar SOMENTE um objeto JSON válido. NUNCA use markdown, crases, comentários ou texto fora do JSON.

Formato EXATO:
{"transactions":[{"type":"EXPENSE","description":"string","amount":0,"paymentMethod":null,"category":null,"paidBy":null}]}

Uma mensagem pode conter VÁRIOS lançamentos (um por linha ou na mesma frase) — gere um item por lançamento.

REGRAS (siga literalmente):
- type: "EXPENSE" para gastos (paguei, comprei, gastei, uber, mercado, gasolina, conta...) e "INCOME" para entradas (recebi, salário, vendi, ganhei, depósito...).
- amount: número decimal com PONTO. Interprete o formato brasileiro: "1.500,00"=1500.00, "84,90"=84.9, "R$50"=50, "30 pila"=30, "30 conto"=30. O ponto é separador de MILHAR, a vírgula é decimal. amount DEVE ser maior que 0.
- description: o que foi comprado/recebido, sem o valor, sem a forma de pagamento, sem o nome do pagador. Curta e em minúsculas como veio.
- paymentMethod: um de [${VALID_PAYMENT_METHODS.join(', ')}] ou null se não mencionado.
- category: escolha a mais adequada APENAS desta lista [${VALID_CATEGORIES.join(', ')}]. Use "Outros" se nenhuma servir.
- paidBy: preencha SOMENTE se um nome da lista de pagadores fornecida aparecer na mensagem; caso contrário null.
- Se a mensagem NÃO contiver nenhum lançamento financeiro (conversa, link, pergunta), retorne {"transactions":[]}.

Baseie-se APENAS no conteúdo da mensagem. NÃO invente valores nem lançamentos.

EXEMPLO
Pagadores: ["Kirk", "Raquel"]
Mensagem: "almocei 32 no crédito e a raquel pagou 84,90 de mercado no pix"
Saída: {"transactions":[{"type":"EXPENSE","description":"almoço","amount":32,"paymentMethod":"Crédito","category":"Alimentação","paidBy":null},{"type":"EXPENSE","description":"mercado","amount":84.9,"paymentMethod":"Pix","category":"Mercado","paidBy":"Raquel"}]}`;

function normalizePaymentMethod(value) {
  if (!value) return null;
  const found = VALID_PAYMENT_METHODS.find((m) => m.toLowerCase() === String(value).toLowerCase());
  return found || null;
}

function normalizeCategory(value) {
  if (!value) return null;
  const found = VALID_CATEGORIES.find((c) => c.toLowerCase() === String(value).toLowerCase());
  return found || 'Outros';
}

function normalizePaidBy(value, payerNames) {
  if (!value) return null;
  const match = payerNames.find((p) => p.toLowerCase() === String(value).toLowerCase());
  return match || null;
}

/**
 * Interpreta uma mensagem usando a IA.
 * @param {string} message - Texto da mensagem (pode conter vários lançamentos)
 * @param {Array<string|{name:string}>} payers - Pagadores configurados
 * @returns {Promise<Array<{type,description,amount,paymentMethodName,categoryName,paidBy}>|null>}
 *          Lista de lançamentos normalizados, [] se não-financeira, ou null em caso de erro/IA indisponível.
 */
async function parseWithAI(message, payers = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[AI Parser] GEMINI_API_KEY não configurada — fallback de IA desativado.');
    return null;
  }
  if (!message || typeof message !== 'string') return null;

  const payerNames = payers.map((p) => (typeof p === 'string' ? p : p?.name)).filter(Boolean);

  const userPayload = `Pagadores: ${JSON.stringify(payerNames)}\nMensagem: "${message.trim()}"`;

  try {
    const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPayload }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[AI Parser] Gemini retornou ${resp.status}: ${body.slice(0, 300)}`);
      return null;
    }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('[AI Parser] Resposta da IA sem texto:', JSON.stringify(data).slice(0, 300));
      return null;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Caso a IA mande crase/markdown apesar da instrução, extrai o primeiro objeto JSON
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error('[AI Parser] Não foi possível extrair JSON da resposta:', text.slice(0, 200));
        return null;
      }
      parsed = JSON.parse(match[0]);
    }

    const rawList = Array.isArray(parsed?.transactions) ? parsed.transactions : [];

    const transactions = rawList
      .map((t) => {
        const amount = Number(t?.amount);
        const type = t?.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
        const description = typeof t?.description === 'string' ? t.description.trim() : '';
        if (!description || !Number.isFinite(amount) || amount <= 0) return null;
        return {
          type,
          description,
          amount,
          paymentMethodName: normalizePaymentMethod(t?.paymentMethod),
          categoryName: normalizeCategory(t?.category),
          paidBy: normalizePaidBy(t?.paidBy, payerNames),
        };
      })
      .filter(Boolean);

    return transactions; // pode ser [] (mensagem não-financeira)
  } catch (err) {
    console.error('[AI Parser] Erro ao chamar Gemini:', err.message);
    return null;
  }
}

module.exports = { parseWithAI };
