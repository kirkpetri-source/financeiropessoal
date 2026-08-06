const { escopoDe } = require('../data/escopo');
const { getMonthlySummary, listTransactions, deleteTransaction } = require('./transactionService');
const { format } = require('date-fns');
const { gerarCodigoVinculo } = require('../utils/codigoVinculo');

/**
 * Comandos que a família pode mandar no grupo.
 *
 * Antes existia uma lista de comandos no webhook que só servia para IGNORAR a
 * mensagem — o usuário digitava "resumo" e não acontecia nada. Agora respondem.
 */

function moeda(valor) {
  return `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizar(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acento: 'ultimos' casa com 'ultimos'
    .replace(/^\//, '');                              // aceita com ou sem barra
}

const AJUDA = [
  '*Como lançar*',
  'Comece dizendo se *gastou* ou *recebeu*:',
  '',
  '_Gastos_',
  '• gastei 84,90 no mercado',
  '• paguei 50 de gasolina no pix',
  '• comprei 1200 de geladeira em 10x',
  '',
  '_Recebimentos_',
  '• recebi 2500 de salário',
  '• ganhei 250 de um serviço',
  '',
  'Para dizer quem pagou, cite o nome no fim:',
  '• gastei 84,90 no mercado raquel',
  '',
  '*Comandos*',
  '• *resumo* — totais do mês',
  '• *ultimos* — últimos lançamentos',
  '• *apagar ultimo* — desfaz o último lançamento',
  '• *categorias* — categorias mais usadas no mês',
  '• *ajuda* — esta mensagem',
].join('\n');

async function comandoResumo(householdId) {
  const dados = escopoDe(householdId);
  const mes = format(new Date(), 'yyyy-MM');
  const resumo = await getMonthlySummary(dados, mes);

  if (!resumo.totalIncome && !resumo.totalExpense) {
    return 'Nenhum lançamento neste mês ainda.';
  }

  const linhas = [
    `*Resumo de ${format(new Date(), 'MM/yyyy')}*`,
    `Receitas: ${moeda(resumo.totalIncome)}`,
    `Despesas: ${moeda(resumo.totalExpense)}`,
    `Saldo: ${resumo.balance >= 0 ? '' : '-'}${moeda(Math.abs(resumo.balance))}`,
  ];

  if (resumo.byPayer.length > 1) {
    linhas.push('', '*Por pessoa*');
    resumo.byPayer.forEach((p) => linhas.push(`• ${p.name}: ${moeda(p.expense)}`));
  }

  if (resumo.topCategory) {
    linhas.push('', `Maior gasto: ${resumo.topCategory.name} (${moeda(resumo.topCategory.value)})`);
  }

  return linhas.join('\n');
}

async function comandoUltimos(householdId) {
  const dados = escopoDe(householdId);
  const mes = format(new Date(), 'yyyy-MM');
  const lista = await listTransactions(dados, { month: mes });

  if (!lista.length) return 'Nenhum lançamento neste mês ainda.';

  const linhas = ['*Últimos lançamentos*'];
  lista.slice(0, 5).forEach((t) => {
    const sinal = t.type === 'INCOME' ? '+' : '-';
    const quem = t.paidBy ? ` (${t.paidBy})` : '';
    linhas.push(`• ${format(new Date(t.date), 'dd/MM')} ${t.description} ${sinal}${moeda(t.amount)}${quem}`);
  });

  return linhas.join('\n');
}

/**
 * Apaga o lançamento mais recente. Confirma o que foi apagado no texto da
 * resposta — sem isso o usuário não tem como saber o que sumiu.
 */
async function comandoApagarUltimo(householdId) {
  const dados = escopoDe(householdId);
  const mes = format(new Date(), 'yyyy-MM');
  const lista = await listTransactions(dados, { month: mes });

  if (!lista.length) return 'Não há lançamentos para apagar neste mês.';

  const ultimo = lista[0];
  await deleteTransaction(dados, ultimo.id);

  return `🗑️ Apagado: ${ultimo.description} — ${moeda(ultimo.amount)}`;
}

async function comandoCategorias(householdId) {
  const dados = escopoDe(householdId);
  const mes = format(new Date(), 'yyyy-MM');
  const resumo = await getMonthlySummary(dados, mes);

  if (!resumo.expenseByCategory.length) return 'Nenhuma despesa neste mês ainda.';

  const linhas = ['*Gastos por categoria*'];
  resumo.expenseByCategory.slice(0, 8).forEach((c) => {
    const fatia = resumo.totalExpense > 0 ? ((c.value / resumo.totalExpense) * 100).toFixed(0) : 0;
    linhas.push(`• ${c.name}: ${moeda(c.value)} (${fatia}%)`);
  });

  return linhas.join('\n');
}

/**
 * Vincula o grupo do WhatsApp à família, pelo código que aparece no painel.
 * É o que substitui o cliente ter que descobrir e digitar o ID do grupo.
 */
async function comandoVincular(codigo, remoteJid) {
  const { db, admin } = require('../config/firebaseAdmin');

  if (!codigo) return 'Informe o código: *vincular ABC123*. Ele aparece nas Configurações do sistema.';
  if (!remoteJid?.endsWith('@g.us')) return 'Esse comando só funciona dentro de um grupo.';

  const snap = await db.collection('households')
    .where('codigoVinculo', '==', codigo.toUpperCase()).limit(1).get();

  if (snap.empty) return 'Código não encontrado. Confira nas Configurações do sistema.';

  const householdId = snap.docs[0].id;

  // Um grupo não pode servir a duas famílias: o webhook acharia a errada.
  const jaUsado = await db.collection('whatsappConfigs')
    .where('groupId', '==', remoteJid).limit(1).get();

  if (!jaUsado.empty && jaUsado.docs[0].id !== householdId) {
    return 'Este grupo já está vinculado a outra conta.';
  }

  await db.collection('whatsappConfigs').doc(householdId).set({
    householdId,
    groupId: remoteJid,
    enabled: true,
    vinculadoEm: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const familia = snap.docs[0].data();
  return `✅ Grupo vinculado a *${familia.name}*!\n\n`
    + 'Comece dizendo se gastou ou recebeu:\n'
    + '• gastei 84,90 no mercado\n'
    + '• recebi 2500 de salário\n\n'
    + 'Digite *ajuda* para ver os comandos.';
}

/**
 * Interpreta e executa. Devolve null quando não é comando — aí a mensagem segue
 * para o caminho normal de lançamento.
 */
async function tratarComando(texto, { householdId, remoteJid }) {
  const limpo = normalizar(texto);

  if (limpo.startsWith('vincular')) {
    const codigo = limpo.split(/\s+/)[1];
    return comandoVincular(codigo, remoteJid);
  }

  // Os demais exigem família já vinculada.
  if (!householdId) return null;

  if (limpo === 'resumo' || limpo === 'resumo mes' || limpo === 'resumo do mes') {
    return comandoResumo(householdId);
  }
  if (limpo === 'ultimos' || limpo === 'ultimos lancamentos') {
    return comandoUltimos(householdId);
  }
  if (limpo === 'apagar ultimo' || limpo === 'desfazer') {
    return comandoApagarUltimo(householdId);
  }
  if (limpo === 'categorias') {
    return comandoCategorias(householdId);
  }
  if (limpo === 'ajuda' || limpo === 'help' || limpo === 'comandos') {
    return AJUDA;
  }

  return null;
}

module.exports = { tratarComando, gerarCodigoVinculo, AJUDA, normalizar };
