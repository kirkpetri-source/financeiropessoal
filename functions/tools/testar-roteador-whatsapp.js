/**
 * Exercita o ROTEADOR do WhatsApp de ponta a ponta, contra o Firestore e o
 * Gemini reais — sem servidor de WhatsApp no meio.
 *
 * O que ele prova, e que nenhum teste de unidade prova sozinho: uma mensagem
 * de lançamento continua virando lançamento DEPOIS da assistente existir. Essa
 * é a regressão que mais assusta nesta fase, porque não daria erro: o gasto
 * simplesmente viraria conversa e ninguém perceberia até o fim do mês.
 *
 *   ALVO=staging node tools/testar-roteador-whatsapp.js
 */

const { carregar } = require('./carregarAmbiente');

if (String(process.env.ALVO || '').toLowerCase() !== 'staging') {
  console.error('\n  Este script só roda em homologação. Use:');
  console.error('    ALVO=staging node tools/testar-roteador-whatsapp.js\n');
  process.exit(1);
}

carregar(['GEMINI_API_KEY']);

const { db, admin } = require('../src/config/firebaseAdmin');
const { escopoDe } = require('../src/data/escopo');
const { decidirSemIA, decidirComIntencao, DESTINO } = require('../src/utils/roteadorMensagem');
const { lancarPorTexto } = require('../src/services/lancamentoPorMensagem');
const { tratarComando } = require('../src/services/comandosWhatsapp');
const assistenteService = require('../src/services/assistenteService');

const FAMILIA = `roteador-${Date.now()}`;
const NOME = 'Nina';

let passou = 0;
let falhou = 0;

function checar(titulo, condicao, detalhe = '') {
  if (condicao) {
    passou += 1;
    console.log(`  OK   ${titulo}`);
  } else {
    falhou += 1;
    console.log(`  FALHA ${titulo}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

async function montar() {
  await db.collection('households').doc(FAMILIA).set({
    name: 'Família do roteador',
    subscription: {
      status: 'active', provider: 'manual', priceCents: 2490,
      currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('households').doc(FAMILIA).collection('members').doc('wa-5564999990001').set({
    role: 'member', name: 'Kirk', phone: '5564999990001',
  });

  await db.collection('whatsappConfigs').doc(FAMILIA).set({
    householdId: FAMILIA, enabled: true, modo: 'individual',
    ownerJid: '5564999990001@s.whatsapp.net', nomeDaAssistente: NOME,
  });

  const dados = escopoDe(FAMILIA);
  await dados.criar('categories', { name: 'Mercado', type: 'EXPENSE', color: '#22c55e' });
  await dados.criar('paymentMethods', { name: 'Pix' });
}

async function limpar() {
  const membros = await db.collection('households').doc(FAMILIA).collection('members').get();
  for (const m of membros.docs) await m.ref.delete();
  await db.collection('households').doc(FAMILIA).delete();
  await db.collection('whatsappConfigs').doc(FAMILIA).delete();

  for (const colecao of ['transactions', 'categories', 'paymentMethods', 'chatSessions', 'whatsappLogs']) {
    const snap = await db.collection(colecao).where('householdId', '==', FAMILIA).get();
    const lote = db.batch();
    snap.docs.forEach((d) => lote.delete(d.ref));
    if (snap.size) await lote.commit();
  }
}

/**
 * Reproduz a decisão do webhook, na mesma ordem, sem o servidor de WhatsApp.
 * Devolve para onde a mensagem foi e o que aconteceu.
 */
async function rotear(texto) {
  const respostaDeComando = await tratarComando(texto, { householdId: FAMILIA, remoteJid: null, senderJid: null });

  const rota = decidirSemIA({
    texto,
    nomeDaAssistente: NOME,
    ehComando: !!respostaDeComando,
    assistenteAtiva: assistenteService.ativa(),
  });

  if (rota.destino === DESTINO.COMANDO) return { destino: 'COMANDO', resposta: respostaDeComando };
  if (rota.destino === DESTINO.CHAT) return { destino: 'CHAT', texto: rota.texto };
  if (rota.destino === DESTINO.IGNORAR) return { destino: 'IGNORAR' };

  const r = await lancarPorTexto({
    householdId: FAMILIA, texto, senderJid: null, pushName: 'Kirk',
    dataDaMensagem: new Date().toISOString(), origem: 'chat privado',
  });

  if (!r.transacoes.length && r.intencaoDaIA) {
    const final = decidirComIntencao({
      texto, intencao: r.intencaoDaIA, assistenteAtiva: true, temLancamentos: false,
    });
    if (final.destino === DESTINO.CHAT) return { destino: 'CHAT', texto, viaIA: true };
    if (final.destino === DESTINO.IGNORAR) return { destino: 'IGNORAR', viaIA: true };
  }

  return { destino: 'LANCAMENTO', criadas: r.criadas || [], erro: r.erro };
}

async function principal() {
  console.log('\nRoteador do WhatsApp — teste contra Firestore e Gemini reais\n');
  await montar();

  console.log('--- O que NAO pode regredir: lancamento continua lancando ---');

  const LANCAMENTOS = [
    ['gastei 84,90 no mercado', 84.9],
    ['paguei 50 de gasolina no pix', 50],
    ['recebi 2500 de salario', 2500],
    ['comprei 120 de remedio', 120],
  ];

  for (const [texto, valor] of LANCAMENTOS) {
    const r = await rotear(texto);
    const ok = r.destino === 'LANCAMENTO' && (r.criadas || []).some((t) => Number(t.amount) === valor);
    checar(`"${texto}" virou lancamento de ${valor}`, ok,
      `foi para ${r.destino}${r.erro ? ` (${r.erro.slice(0, 60)})` : ''}`);
  }

  console.log('\n--- Chamado pelo nome vai para a assistente ---');

  const c1 = await rotear('Nina, quanto gastei em mercado?');
  checar('pergunta com o nome vai para o chat', c1.destino === 'CHAT', `foi para ${c1.destino}`);
  checar('o nome foi removido da pergunta', c1.texto === 'quanto gastei em mercado?', c1.texto);

  // O caso que so o nome resolve: a frase casaria na regra de lancamento.
  const c2 = await rotear('Nina, gastei 200 no mercado, ta muito?');
  checar('com o nome, frase de lancamento vira conversa', c2.destino === 'CHAT', `foi para ${c2.destino}`);

  const c3 = await rotear('Nyna, quanto gastei?');
  checar('tolera erro de transcricao no nome', c3.destino === 'CHAT', `foi para ${c3.destino}`);

  console.log('\n--- Sem o nome, a IA classifica ---');

  const p1 = await rotear('quanto gastei no mercado esse mes?');
  checar('pergunta sem o nome tambem vai para o chat', p1.destino === 'CHAT',
    `foi para ${p1.destino}`);
  checar('foi pela classificacao da IA, sem chamada extra', p1.viaIA === true);

  const p2 = await rotear('como posso diminuir minhas despesas?');
  checar('pedido de conselho vai para o chat', p2.destino === 'CHAT', `foi para ${p2.destino}`);

  console.log('\n--- Comandos continuam de graca ---');

  const cmd = await rotear('resumo');
  checar('comando responde sem IA', cmd.destino === 'COMANDO', `foi para ${cmd.destino}`);
  checar('a resposta do comando tem conteudo', !!cmd.resposta);

  console.log('\n--- Conversa solta nao vira "nao entendi" ---');

  const oi = await rotear('bom dia');
  checar('saudacao e ignorada', oi.destino === 'IGNORAR', `foi para ${oi.destino}`);

  console.log('\n--- Confere no banco ---');

  const tx = await db.collection('transactions').where('householdId', '==', FAMILIA).get();
  const valores = tx.docs.map((d) => d.data().amount).sort((a, b) => a - b);
  checar('so os 4 lancamentos reais foram gravados', tx.size === 4, `gravados: ${valores.join(', ')}`);
  checar('nenhum lancamento fantasma de pergunta',
    !valores.includes(200), `valores: ${valores.join(', ')}`);

  console.log('\n--- Limpeza ---');
  await limpar();
  const sobrou = await db.collection('transactions').where('householdId', '==', FAMILIA).get();
  checar('familia de teste apagada', sobrou.empty);

  console.log(`\n${passou} passaram, ${falhou} falharam.\n`);
  process.exit(falhou > 0 ? 1 : 0);
}

principal().catch(async (err) => {
  console.error('\nErro no teste:', err.message);
  try { await limpar(); console.error('Limpeza feita.'); } catch { /* nada a fazer */ }
  process.exit(1);
});
