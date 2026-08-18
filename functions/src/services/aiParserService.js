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
{"intencao":"LANCAMENTO","transactions":[{"type":"EXPENSE","description":"string","amount":0,"paymentMethod":null,"category":null,"paidBy":null}]}

Uma mensagem pode conter VÁRIOS lançamentos (um por linha ou na mesma frase) — gere um item por lançamento.

INTENÇÃO — decida antes de tudo:
- "LANCAMENTO": a pessoa está REGISTRANDO algo que aconteceu ("gastei 30 no mercado", "recebi meu salário", "50 de gasolina").
- "PERGUNTA": a pessoa está PERGUNTANDO ou PEDINDO ALGO sobre as finanças dela ("quanto gastei em mercado?", "como diminuir minhas despesas?", "quais são minhas categorias?", "apaga o último lançamento", "muda a categoria disso").
- "OUTRO": não é nem uma coisa nem outra (saudação, agradecimento, assunto que não é dinheiro).
Se for PERGUNTA ou OUTRO, "transactions" DEVE ser [].

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
Saída: {"intencao":"LANCAMENTO","transactions":[{"type":"EXPENSE","description":"almoço","amount":32,"paymentMethod":"Crédito","category":"Alimentação","paidBy":null},{"type":"EXPENSE","description":"mercado","amount":84.9,"paymentMethod":"Pix","category":"Mercado","paidBy":"Raquel"}]}

EXEMPLO 2
Mensagem: "quanto gastei no mercado esse mes?"
Saída: {"intencao":"PERGUNTA","transactions":[]}

EXEMPLO 3
Mensagem: "apaga o ultimo lancamento"
Saída: {"intencao":"PERGUNTA","transactions":[]}`;

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

    // A intenção acompanha o resultado para o roteador do WhatsApp saber se a
    // mensagem era pergunta — sem gastar uma chamada de IA só para classificar,
    // já que esta aqui acontece de qualquer jeito quando a regra não dá conta.
    const intencao = ['LANCAMENTO', 'PERGUNTA', 'OUTRO'].includes(parsed?.intencao)
      ? parsed.intencao
      : (transactions.length ? 'LANCAMENTO' : 'OUTRO');

    // Continua sendo um array (era o contrato antigo, e todo mundo que já
    // chamava esta função segue funcionando sem mudar). A intenção vem como
    // propriedade dele, que é o jeito de acrescentar sem quebrar ninguém.
    transactions.intencao = intencao;

    return transactions; // pode ser [] (mensagem não-financeira)
  } catch (err) {
    console.error('[AI Parser] Erro ao chamar Gemini:', err.message);
    return null;
  }
}

const SUBCATEGORIA_INCERTO = 'INCERTO';

/**
 * Escolhe, entre as subcategorias já cadastradas para UMA categoria, qual
 * combina com a descrição do lançamento. Chamada só quando a categoria
 * resolvida (por regra ou por IA) já tem subcategoria cadastrada — famílias
 * sem subcategoria nunca pagam esse custo extra.
 *
 * Devolve o nome exato de uma das `opcoes`, ou null quando a IA respondeu
 * INCERTO (ou qualquer coisa que não bata) — nesse caso quem chamou decide
 * perguntar ao usuário, nunca adivinha.
 *
 * @param {{descricao: string, categoriaNome: string, opcoes: string[]}} params
 * @returns {Promise<string|null>}
 */
async function resolverSubcategoria({ descricao, categoriaNome, opcoes }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !opcoes?.length) return null;

  const prompt = `Uma pessoa registrou um gasto na categoria "${categoriaNome}": "${descricao}".\n`
    + `Subcategorias existentes: ${JSON.stringify(opcoes)}.\n`
    + `Responda SOMENTE com o nome EXATO de uma dessas subcategorias, ou a palavra ${SUBCATEGORIA_INCERTO} `
    + 'se não for possível decidir com confiança. Nada além disso — sem pontuação, sem explicação.';

  try {
    const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0 },
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[AI Parser] Subcategoria — Gemini retornou ${resp.status}: ${body.slice(0, 300)}`);
      return null;
    }

    const data = await resp.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!texto || texto.toUpperCase() === SUBCATEGORIA_INCERTO) return null;

    const bateu = opcoes.find((nome) => nome.toLowerCase() === texto.toLowerCase());
    return bateu || null;
  } catch (err) {
    console.error('[AI Parser] Erro ao resolver subcategoria:', err.message);
    return null;
  }
}

/**
 * Categoriza descrições de EXTRATO BANCÁRIO em lote — uma chamada para até
 * ~80 descrições distintas.
 *
 * É um prompt separado de `parseWithAI` porque o material é diferente:
 * mensagem de WhatsApp é uma frase que a pessoa escreveu ("gastei 30 no
 * mercado"), enquanto extrato traz o nome do estabelecimento como a
 * maquininha registrou ("PAG*REST DONA MARIA LTDA"). Aqui não há valor nem
 * tipo para extrair — só classificar um nome.
 *
 * Regra de ouro deste prompt: **na dúvida, responder "Outros"**. Um palpite
 * errado entra silenciosamente no orçamento da família e distorce o gráfico
 * do mês; um "Outros" honesto aparece na tela pedindo revisão. Errar para o
 * lado de admitir ignorância é o comportamento certo aqui.
 *
 * @param {string[]} descricoes  descrições já limpas do ruído bancário
 * @returns {Promise<Object>} mapa descrição -> categoria (só o que a IA soube)
 */
async function categorizarDescricoesEmLote(descricoes) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !descricoes?.length) return {};

  const prompt = `Você classifica lançamentos de EXTRATO BANCÁRIO brasileiro em categorias.

Cada item é a descrição de uma transação como o banco registrou — normalmente o nome de um estabelecimento, empresa ou pessoa.

Categorias permitidas (use EXATAMENTE estes nomes):
${VALID_CATEGORIES.join(', ')}

REGRAS:
- Responda SOMENTE um objeto JSON: {"descrição exata recebida": "Categoria"}
- Use a descrição EXATAMENTE como veio, sem alterar, como chave.
- Classifique pelo RAMO do estabelecimento: supermercado/hortifruti/atacado = Mercado; restaurante/lanchonete/padaria/delivery = Alimentação; posto/combustível = Combustível; drogaria/farmácia = Farmácia; consultório/laboratório/plano de saúde = Saúde; escola/faculdade/curso = Educação; streaming/aplicativo por assinatura = Assinaturas; loja de roupa/eletrônico/papelaria/pet = Outros.
- **Nome de PESSOA FÍSICA (transferência, Pix entre pessoas) SEMPRE "Outros"** — é impossível saber se é salário, reembolso ou empréstimo, e adivinhar corrompe o orçamento de quem confia no sistema.
- Na menor dúvida sobre o ramo, responda "Outros". É melhor deixar em branco que classificar errado.
- Não invente categoria fora da lista. Não explique. Não use markdown.

Itens:
${JSON.stringify(descricoes)}`;

  try {
    const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[AI Parser] Lote de extrato — Gemini retornou ${resp.status}: ${body.slice(0, 300)}`);
      return {};
    }

    const data = await resp.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) return {};

    let bruto;
    try {
      bruto = JSON.parse(texto);
    } catch {
      const match = texto.match(/\{[\s\S]*\}/);
      if (!match) return {};
      bruto = JSON.parse(match[0]);
    }

    // Só passa adiante o que a IA respondeu para uma descrição que REALMENTE
    // enviamos e com uma categoria que existe. Modelo alucina chave e
    // categoria, e um nome de categoria inventado quebraria a resolução do
    // id lá na frente.
    const enviadas = new Set(descricoes);
    const mapa = {};

    for (const [descricao, categoria] of Object.entries(bruto || {})) {
      if (!enviadas.has(descricao)) continue;
      const valida = VALID_CATEGORIES.find((c) => c.toLowerCase() === String(categoria).toLowerCase());
      // 'Outros' é a ausência de resposta: não vale gravar como se fosse
      // uma classificação, senão a linha some da revisão do usuário.
      if (valida && valida !== 'Outros') mapa[descricao] = valida;
    }

    return mapa;
  } catch (err) {
    console.error('[AI Parser] Erro ao categorizar lote de extrato:', err.message);
    return {};
  }
}

module.exports = { parseWithAI, resolverSubcategoria, categorizarDescricoesEmLote };
