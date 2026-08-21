/**
 * Quanto a assistente é USADA de verdade — o volume, não o preço unitário.
 *
 * A decisão de trocar de modelo estava sendo tomada em cima do PIOR CASO
 * TEÓRICO: "20 conversas/dia × R$ 0,045 = R$ 27,19/mês, mais que a
 * mensalidade". Só que ninguém tinha olhado quantas conversas acontecem de
 * fato. Teto não é consumo.
 *
 * SOMENTE LEITURA. Não escreve nada, em nenhum ambiente.
 *
 * DE ONDE VEM O NÚMERO
 *
 * `whatsappLogs` é a única fonte com histórico: o contador de cota
 * (`whatsappConfigs.chatContagemDiaria`) guarda só o dia corrente, e as
 * sessões de conversa expiram em 6 horas. Cada mensagem recebida pelo canal
 * vira um log, e dá para separar o que foi conversa do que foi lançamento:
 *
 *   PROCESSED com transactionId  -> lançamento (não passou pelo chat)
 *   PROCESSED sem transactionId  -> conversa com a assistente
 *   CANCELLED                    -> o roteador ignorou (custo zero)
 *   ERROR                        -> não entendeu ou falhou
 *
 * O QUE ESTE NÚMERO NÃO COBRE: conversa pelo PAINEL não passa por
 * `whatsappLogs`. Enquanto a assistente estiver liberada só para a família de
 * teste, isso é pequeno; ao liberar para todos, vale medir os dois.
 *
 * E CONVERSA NÃO É SINÔNIMO DE CUSTO DE IA: desde a camada sem IA (regra 19),
 * consulta é respondida direto do banco, sem modelo. O log não distingue as
 * duas, então o total abaixo é o TETO do que pode ter custado, nunca menos.
 *
 *   node tools/medir-uso-da-assistente.js [dias]      # produção (padrão: 30)
 *   ALVO=staging node tools/medir-uso-da-assistente.js
 */

const { carregar } = require('./carregarAmbiente');

carregar();

const { db } = require('../src/config/firebaseAdmin');

const DIAS = Number(process.argv[2]) || 30;

// Faixa medida em produção, do log do próprio serviço (`[ChatIA] ... custo=`).
// Duas pontas porque o custo varia com o tamanho da resposta e do raciocínio.
const CUSTO_MIN = 0.0157;
const CUSTO_MAX = 0.0348;

function diaNoBrasil(data) {
  return new Date(data.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    .toISOString().slice(0, 10);
}

function moeda(v) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

async function familias() {
  const lista = String(process.env.ASSISTENTE_FAMILIAS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  const snap = await db.collection('households').get();
  const todas = snap.docs.map((d) => ({ id: d.id, nome: d.data().name || '(sem nome)' }));

  if (!lista.length) return { todas, comAssistente: todas, restrita: false };

  return {
    todas,
    comAssistente: todas.filter((f) => lista.includes(f.id)),
    restrita: true,
  };
}

/**
 * Logs da família dentro da janela.
 *
 * Filtra por família no Firestore e recorta a data em MEMÓRIA de propósito:
 * igualdade + range em campos diferentes exigiria índice composto (regra 12),
 * e aqui são dezenas a centenas de documentos por família.
 */
async function logsDaFamilia(householdId, desde) {
  const snap = await db.collection('whatsappLogs')
    .where('householdId', '==', householdId).get();

  return snap.docs
    .map((d) => d.data())
    .map((l) => ({ ...l, quando: l.createdAt?.toDate?.() || null }))
    .filter((l) => l.quando && l.quando >= desde);
}

function classificar(log) {
  if (log.processingStatus === 'PROCESSED') {
    return log.transactionId ? 'lancamento' : 'conversa';
  }
  if (log.processingStatus === 'CANCELLED') return 'ignorado';
  if (log.processingStatus === 'ERROR') return 'erro';
  return 'outro';
}

async function principal() {
  const desde = new Date(Date.now() - DIAS * 864e5);
  const { comAssistente, restrita } = await familias();

  console.log(`\n=== USO REAL DA ASSISTENTE — ${DIAS} dias ===`);
  console.log(restrita
    ? `Liberada para ${comAssistente.length} família(s) (ASSISTENTE_FAMILIAS).`
    : `Liberada para TODAS as ${comAssistente.length} famílias.`);
  console.log(`Janela: de ${desde.toISOString().slice(0, 10)} até hoje\n`);

  let totalConversas = 0;
  let piorDiaGlobal = { dia: null, conversas: 0, familia: null };

  for (const familia of comAssistente) {
    const logs = await logsDaFamilia(familia.id, desde);

    const porDia = {};
    const totais = { conversa: 0, lancamento: 0, ignorado: 0, erro: 0, outro: 0 };

    for (const log of logs) {
      const tipo = classificar(log);
      totais[tipo] = (totais[tipo] || 0) + 1;

      if (tipo !== 'conversa') continue;
      const dia = diaNoBrasil(log.quando);
      porDia[dia] = (porDia[dia] || 0) + 1;
    }

    const diasComConversa = Object.keys(porDia).length;
    const pico = Object.entries(porDia).sort((a, b) => b[1] - a[1])[0];

    totalConversas += totais.conversa;

    if (pico && pico[1] > piorDiaGlobal.conversas) {
      piorDiaGlobal = { dia: pico[0], conversas: pico[1], familia: familia.nome };
    }

    console.log(`${familia.nome}  [${familia.id}]`);
    console.log(`  conversas com a assistente : ${totais.conversa}`);
    console.log(`  lançamentos               : ${totais.lancamento}`);
    console.log(`  ignoradas (custo zero)    : ${totais.ignorado}`);
    console.log(`  erros                     : ${totais.erro}`);
    console.log(`  dias com alguma conversa  : ${diasComConversa} de ${DIAS}`);
    console.log(`  pico em um dia            : ${pico ? `${pico[1]} (${pico[0]})` : '0'}`);
    console.log(`  média por dia da janela   : ${(totais.conversa / DIAS).toFixed(2)}\n`);
  }

  const porMes = (totalConversas / DIAS) * 30;

  console.log('--- LEITURA ---');
  console.log(`Conversas somadas na janela : ${totalConversas}`);
  console.log(`Projeção por mês            : ${porMes.toFixed(1)} conversas`);
  console.log(`Custo de IA, no MÁXIMO      : ${moeda(porMes * CUSTO_MIN)} a ${moeda(porMes * CUSTO_MAX)}/mês`);
  console.log('  (teto: parte dessas conversas foi respondida sem IA, e essas custaram zero)');
  console.log(`Maior dia observado         : ${piorDiaGlobal.conversas} conversas`
    + `${piorDiaGlobal.dia ? ` em ${piorDiaGlobal.dia} (${piorDiaGlobal.familia})` : ''}`);
  console.log(`Teto diário configurado     : ${Number(process.env.LIMITE_DIARIO_CHAT) || 20} por família`);
  console.log('');
}

principal()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nFalhou:', err.message);
    process.exit(1);
  });
