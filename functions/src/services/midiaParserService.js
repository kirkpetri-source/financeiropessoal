/**
 * Transcrição de áudio e leitura de cupom fiscal via Gemini multimodal.
 *
 * Devolve TEXTO em linguagem natural (não a transação já estruturada) de
 * propósito: assim o resultado passa pelo MESMO caminho de interpretação que
 * uma mensagem digitada (parseFinancialMessage / parseWithAI, acionados por
 * `lancarPorTexto` em lancamentoPorMensagem.js), em vez de duplicar toda a
 * lógica de resolver categoria, forma de pagamento e pagador para um segundo
 * formato de entrada.
 *
 * Mesmo padrão de aiParserService.js: Gemini 2.0 Flash via REST, chave em
 * GEMINI_API_KEY, sem SDK extra.
 */

// Mesmo modelo do aiParserService.js — ver o comentário lá sobre a
// descontinuação do gemini-2.0-flash em 01/06/2026.
const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Acima disso não manda pro Gemini — guarda de custo simples. Nota de voz do
// WhatsApp comum fica bem abaixo disso; um áudio de vários minutos ou uma
// foto em resolução absurda provavelmente não é um lançamento, é engano.
const LIMITE_BYTES = 8 * 1024 * 1024;

function tamanhoDoBase64(base64) {
  return Math.ceil((base64.length * 3) / 4);
}

const MENSAGEM_GENERICA = 'Não consegui entender o arquivo. Tente digitar o lançamento.';
// Cota/limite de taxa do Gemini (429) é diferente de "não entendeu o conteúdo" — merece
// mensagem própria, porque quem lê no WhatsApp não tem como saber que é passageiro.
const MENSAGEM_COTA = 'Estou processando muitos pedidos agora. Tente de novo em alguns minutos, ou digite o lançamento.';

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function chamarGeminiUmaVez(apiKey, base64, mimeType, prompt) {
  const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
      generationConfig: { temperature: 0 },
    }),
  });

  if (!resp.ok) {
    const corpo = await resp.text();
    console.error(`[MidiaParser] Gemini retornou ${resp.status}: ${corpo.slice(0, 300)}`);
    return { ok: false, status: resp.status };
  }

  const data = await resp.json();
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return { ok: true, texto: texto || null };
}

async function chamarGemini(base64, mimeType, prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[MidiaParser] GEMINI_API_KEY não configurada.');
    return { texto: null, erro: 'IA indisponível no momento. Tente digitar o lançamento.' };
  }
  if (!base64 || !mimeType) return { texto: null, erro: 'Não recebi o arquivo. Tente enviar de novo.' };
  if (tamanhoDoBase64(base64) > LIMITE_BYTES) {
    return { texto: null, erro: 'Arquivo grande demais. Tente digitar o lançamento.' };
  }

  try {
    let resultado = await chamarGeminiUmaVez(apiKey, base64, mimeType, prompt);

    // 429 (cota) e 503 (sobrecarga do modelo) costumam ser passageiros —
    // uma segunda tentativa depois de uma pausa curta resolve a maioria sem
    // o cliente precisar reenviar nada.
    if (!resultado.ok && (resultado.status === 429 || resultado.status === 503)) {
      await aguardar(2000);
      resultado = await chamarGeminiUmaVez(apiKey, base64, mimeType, prompt);
    }

    if (!resultado.ok) {
      return { texto: null, erro: resultado.status === 429 ? MENSAGEM_COTA : MENSAGEM_GENERICA };
    }
    if (!resultado.texto) return { texto: null, erro: MENSAGEM_GENERICA };

    return { texto: resultado.texto, erro: null };
  } catch (err) {
    console.error('[MidiaParser] Erro ao chamar Gemini:', err.message);
    return { texto: null, erro: MENSAGEM_GENERICA };
  }
}

const PROMPT_AUDIO = 'Transcreva este áudio em português do Brasil, como se a pessoa estivesse '
  + 'digitando a frase num app financeiro. Sem adicionar comentário nenhum. '
  + 'IMPORTANTE sobre valores em dinheiro: se a pessoa falar o valor separando reais e centavos '
  + '(por exemplo "quatro e cinquenta", "quatro reais e cinquenta centavos"), escreva o valor '
  + 'JUNTO como um único número com vírgula decimal — "4,50" — nunca como dois números separados '
  + 'por "e" (errado: "4 e 50"). Se falar um valor sem centavos (ex: "cinquenta reais"), escreva só '
  + '"50". Responda SÓ com a transcrição, em texto simples. '
  + 'Se não conseguir entender nenhuma fala, responda exatamente: SEM_FALA';

const PROMPT_CUPOM = 'Esta imagem é um cupom fiscal ou recibo de compra brasileiro. Leia o valor '
  + 'TOTAL da compra e o nome do estabelecimento (se estiver legível) e escreva UMA frase curta '
  + 'em português, no formato que uma pessoa digitaria num app financeiro, por exemplo: '
  + '"gastei 84,90 no mercado extra" ou "paguei 45,00 na farmácia". Use PONTO como separador de '
  + 'milhar e VÍRGULA como decimal, igual nota fiscal brasileira. Responda SÓ com essa frase, sem '
  + 'mais nada. Se a imagem não parecer um cupom ou recibo, ou não der para ler o valor total, '
  + 'responda exatamente: SEM_CUPOM';

async function transcreverAudio(base64, mimeType) {
  const { texto, erro } = await chamarGemini(base64, mimeType, PROMPT_AUDIO);
  if (erro) return { texto: null, erro };
  if (!texto || /^SEM_FALA/i.test(texto)) {
    return { texto: null, erro: 'Não entendi o áudio. Tente falar de novo ou digitar o lançamento.' };
  }
  return { texto, erro: null };
}

async function interpretarCupom(base64, mimeType) {
  const { texto, erro } = await chamarGemini(base64, mimeType, PROMPT_CUPOM);
  if (erro) return { texto: null, erro };
  if (!texto || /^SEM_CUPOM/i.test(texto)) {
    return { texto: null, erro: 'Não consegui ler essa imagem como cupom. Tente digitar o lançamento.' };
  }
  return { texto, erro: null };
}

module.exports = { transcreverAudio, interpretarCupom, LIMITE_BYTES };
