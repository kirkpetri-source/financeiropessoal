/**
 * De que É FEITO o prompt da assistente, token a token.
 *
 * A pergunta que isto responde: o custo por pergunta vem de dado financeiro
 * demais indo no prompt (que seria consertável enxugando o contexto) ou da
 * estrutura fixa — instrução + catálogo de ferramentas — que vai inteira em
 * TODA chamada e ainda é reenviada a cada rodada?
 *
 * A diferença muda a solução: no primeiro caso corta-se contexto; no segundo,
 * corta-se catálogo e número de rodadas, e enxugar contexto não adianta nada.
 *
 * Usa o endpoint `countTokens` do próprio Gemini — contagem exata, do mesmo
 * tokenizador que fatura, não estimativa por caractere.
 *
 *   ALVO=staging node tools/medir-composicao-do-prompt.js
 */

const { carregar } = require('./carregarAmbiente');

if (String(process.env.ALVO || '').toLowerCase() !== 'staging') {
  console.error('\n  Este script só roda em homologação. Use:');
  console.error('    ALVO=staging node tools/medir-composicao-do-prompt.js\n');
  process.exit(1);
}

carregar(['GEMINI_API_KEY']);

const { montarInstrucao, FERRAMENTAS, MODELO } = require('../src/services/chatIAService');

const URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Contagem exata, pelo tokenizador do modelo.
 *
 * `countTokens` só aceita `systemInstruction` e `tools` dentro do envelope
 * `generateContentRequest` — soltos no corpo dá 400 "Cannot find field".
 */
async function contar(corpo) {
  const precisaEnvelope = corpo.systemInstruction || corpo.tools;
  const payload = precisaEnvelope
    ? { generateContentRequest: { model: `models/${MODELO}`, ...corpo } }
    : corpo;

  const resp = await fetch(`${URL}/${MODELO}:countTokens?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    throw new Error(`countTokens respondeu ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }

  const dados = await resp.json();
  return dados.totalTokens || 0;
}

/** Vocabulário parecido com o de uma família real de verdade. */
function vocabularioDeExemplo(quantasCategorias = 14, subPorCategoria = 3) {
  const nomes = [
    'Mercado', 'Combustível', 'Alimentação', 'Energia', 'Água', 'Internet',
    'Farmácia', 'Transporte', 'Moradia', 'Saúde', 'Educação', 'Lazer',
    'Assinaturas', 'Outros', 'Salário', 'Vendas',
  ];

  return nomes.slice(0, quantasCategorias).map((categoria) => ({
    categoria,
    tipo: 'EXPENSE',
    subcategorias: Array.from({ length: subPorCategoria }, (_, i) => `${categoria} sub ${i + 1}`),
  }));
}

(async () => {
  console.log(`\n=== COMPOSIÇÃO DO PROMPT — ${MODELO} ===\n`);

  const vocabulario = vocabularioDeExemplo();

  const instrucaoCompleta = montarInstrucao({
    nomeDaIA: 'Nina',
    vocabulario,
    canal: 'WHATSAPP',
    mesAtual: '2026-08',
    interlocutorConhecido: true,
  });

  const instrucaoSemVocabulario = montarInstrucao({
    nomeDaIA: 'Nina',
    vocabulario: [],
    canal: 'WHATSAPP',
    mesAtual: '2026-08',
    interlocutorConhecido: true,
  });

  const declaracoes = FERRAMENTAS.map(({ exigePermissao, ...decl }) => decl);
  const pergunta = 'Quanto gastei no mercado esse mês?';

  // Cada peça é medida sozinha, com o resto vazio, para o número ser dela.
  const soInstrucao = await contar({
    systemInstruction: { parts: [{ text: instrucaoCompleta }] },
    contents: [{ role: 'user', parts: [{ text: '' }] }],
  });

  const soInstrucaoSemVocab = await contar({
    systemInstruction: { parts: [{ text: instrucaoSemVocabulario }] },
    contents: [{ role: 'user', parts: [{ text: '' }] }],
  });

  const soPergunta = await contar({
    contents: [{ role: 'user', parts: [{ text: pergunta }] }],
  });

  const comFerramentas = await contar({
    systemInstruction: { parts: [{ text: instrucaoCompleta }] },
    tools: [{ functionDeclarations: declaracoes }],
    contents: [{ role: 'user', parts: [{ text: pergunta }] }],
  });

  const ferramentas = comFerramentas - soInstrucao - soPergunta;
  const vocab = soInstrucao - soInstrucaoSemVocab;

  console.log('PRIMEIRA RODADA (o que sai antes de qualquer dado financeiro):');
  console.log(`  instrução do sistema (texto fixo) : ${soInstrucaoSemVocab}`);
  console.log(`  vocabulário da família            : ${vocab}   (${vocabulario.length} categorias)`);
  console.log(`  catálogo de ${String(declaracoes.length).padStart(2)} ferramentas        : ${ferramentas}`);
  console.log(`  a pergunta em si                  : ${soPergunta}`);
  console.log(`  ------------------------------------------`);
  console.log(`  TOTAL da 1a rodada                : ${comFerramentas}`);

  const fixo = comFerramentas - soPergunta;
  console.log(`\n  Parte FIXA (repete em toda chamada): ${fixo} tokens`);
  console.log(`  Parte variável (a pergunta)        : ${soPergunta} tokens`);
  console.log(`  A pergunta é ${((soPergunta / comFerramentas) * 100).toFixed(1)}% do que se paga na 1a rodada.`);

  // O custo de verdade: o loop reenvia TUDO a cada volta, mais o resultado
  // das ferramentas que já voltaram.
  console.log('\nPOR QUE A CONTA CRESCE: o loop reenvia a conversa inteira.');
  const RODADAS = 2.8;
  console.log(`  Média medida de chamadas por pergunta: ${RODADAS}`);
  console.log(`  Piso teórico (parte fixa x rodadas)  : ${Math.round(fixo * RODADAS)} tokens`);
  console.log('  Medido em produção                   : ~7.753 tokens de entrada');
  console.log(`  Diferença (resultado das ferramentas): ~${Math.round(7753 - fixo * RODADAS)} tokens`);

  console.log('\nCATÁLOGO, FERRAMENTA POR FERRAMENTA:');
  const custos = [];
  for (const decl of declaracoes) {
    const t = await contar({
      tools: [{ functionDeclarations: [decl] }],
      contents: [{ role: 'user', parts: [{ text: '' }] }],
    });
    custos.push({ nome: decl.name, tokens: t });
  }
  custos.sort((a, b) => b.tokens - a.tokens);
  for (const c of custos) {
    console.log(`  ${String(c.tokens).padStart(4)}  ${c.nome}`);
  }

  console.log('\n=========================================\n');
  process.exit(0);
})().catch((err) => {
  console.error('\nFalhou:', err.message);
  process.exit(1);
});
