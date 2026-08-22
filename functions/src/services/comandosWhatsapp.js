const { escopoDe } = require('../data/escopo');
const { getMonthlySummary, listTransactions, deleteTransaction, updateTransaction } = require('./transactionService');
const { listCategories } = require('./categoryService');
const { listSubcategories } = require('./subcategoryService');
const { bloqueioPorAssinatura, telefoneEfetivo } = require('./lancamentoPorMensagem');
const { format } = require('date-fns');
const { gerarCodigoVinculo } = require('../utils/codigoVinculo');
const { normalizar } = require('../utils/normalizarTexto');

/**
 * Comandos que a família pode mandar no grupo.
 *
 * Antes existia uma lista de comandos no webhook que só servia para IGNORAR a
 * mensagem — o usuário digitava "resumo" e não acontecia nada. Agora respondem.
 */

function moeda(valor) {
  return `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  '• *apagar ultimo* (ou *errado*, *apaga*, *cancela*) — desfaz o último lançamento',
  '• *categoria mercado* — muda a categoria do último lançamento',
  '• *subcategoria padaria* — muda a subcategoria do último lançamento (ou *sem subcategoria* pra remover)',
  '• *categorias* — categorias mais usadas no mês',
  '• *ajuda* — esta mensagem',
  '',
  'Guia completo, com tudo que dá para fazer:',
  'revelacash.com.br/ajuda',
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
 *
 * Como qualquer escrita (regra 6 do projeto), respeita o bloqueio de
 * assinatura vencida — sem isso, "apagar ultimo"/"mudar categoria" seriam uma
 * porta dos fundos de escrita para quem está bloqueado de lançar.
 */
async function comandoApagarUltimo(householdId) {
  const bloqueio = await bloqueioPorAssinatura(householdId);
  if (bloqueio) return bloqueio;

  const dados = escopoDe(householdId);
  const mes = format(new Date(), 'yyyy-MM');
  const lista = await listTransactions(dados, { month: mes });

  if (!lista.length) return 'Não há lançamentos para apagar neste mês.';

  const ultimo = lista[0];
  await deleteTransaction(dados, ultimo.id);

  return `🗑️ Apagado: ${ultimo.description} — ${moeda(ultimo.amount)}`;
}

/**
 * Muda a categoria do lançamento mais recente. Não usa IA nem tenta entender
 * frase livre — casa por nome exato (sem acento/maiúscula) contra as
 * categorias já cadastradas, do mesmo tipo (receita/despesa) do lançamento.
 * Errar o nome não muda nada, só avisa — silêncio seria pior que recusar.
 */
async function comandoMudarCategoria(householdId, nomeCategoria) {
  const bloqueio = await bloqueioPorAssinatura(householdId);
  if (bloqueio) return bloqueio;

  if (!nomeCategoria) {
    return 'Diga o nome da categoria: *categoria mercado*. Digite *categorias* para ver as usadas no mês.';
  }

  const dados = escopoDe(householdId);
  const mes = format(new Date(), 'yyyy-MM');
  const lista = await listTransactions(dados, { month: mes });

  if (!lista.length) return 'Não há lançamento neste mês para mudar a categoria.';

  const ultimo = lista[0];
  const categorias = await listCategories(dados);
  const alvo = categorias.find((c) => (c.type === ultimo.type || c.type === 'BOTH')
    && normalizar(c.name) === normalizar(nomeCategoria));

  if (!alvo) {
    return `Não encontrei a categoria "${nomeCategoria}". Digite *categorias* para ver as usadas no mês, ou crie-a no painel.`;
  }

  await updateTransaction(dados, ultimo.id, { categoryId: alvo.id });
  return `✅ Categoria de "${ultimo.description}" (${moeda(ultimo.amount)}) alterada para *${alvo.name}*.`;
}

const GATILHOS_LIMPAR_SUBCATEGORIA = ['sem subcategoria', 'remover subcategoria', 'nenhuma subcategoria'];

/**
 * Muda a subcategoria do lançamento mais recente. Mesmo padrão de
 * comandoMudarCategoria: casa por nome exato (sem acento/maiúscula) contra as
 * subcategorias já cadastradas para a categoria do lançamento, sem IA nem
 * frase livre. "sem subcategoria" limpa em vez de recusar.
 *
 * Quando o nome digitado não bate com nenhuma opção, abre a MESMA pendência
 * de confirmação que a IA usa (ver lancamentoPorMensagem.resolverOuPerguntarSubcategoria)
 * — sem isso, a pessoa via a lista de opções, respondia com uma delas, e a
 * resposta caía no vazio (achado testando de verdade pelo WhatsApp,
 * 11/08/2026): "subcategoria carne" não achava, listava as opções, e
 * responder "Açougue" em seguida não tinha pra onde ir.
 */
async function comandoMudarSubcategoria(householdId, nomeSubcategoria, senderJid) {
  const bloqueio = await bloqueioPorAssinatura(householdId);
  if (bloqueio) return bloqueio;

  if (!nomeSubcategoria) {
    return 'Diga o nome da subcategoria: *subcategoria padaria*, ou *sem subcategoria* para remover.';
  }

  const dados = escopoDe(householdId);
  const mes = format(new Date(), 'yyyy-MM');
  const lista = await listTransactions(dados, { month: mes });

  if (!lista.length) return 'Não há lançamento neste mês para mudar a subcategoria.';

  const ultimo = lista[0];

  if (GATILHOS_LIMPAR_SUBCATEGORIA.includes(normalizar(nomeSubcategoria))) {
    await updateTransaction(dados, ultimo.id, { subcategoryId: null });
    return `✅ Subcategoria removida de "${ultimo.description}" (${moeda(ultimo.amount)}).`;
  }

  const subcategorias = await listSubcategories(dados, ultimo.categoryId);
  const alvo = subcategorias.find((s) => normalizar(s.name) === normalizar(nomeSubcategoria));

  if (!alvo) {
    if (!subcategorias.length) {
      return `A categoria de "${ultimo.description}" ainda não tem subcategorias cadastradas. Crie uma no painel.`;
    }

    const telefone = await telefoneEfetivo(senderJid, householdId);
    if (telefone) {
      await dados.criar('pendingSubcategoryConfirmations', {
        phone: telefone,
        transactionId: ultimo.id,
        categoryId: ultimo.categoryId,
        categoryName: ultimo.category?.name || '',
        opcoes: subcategorias.map((s) => ({ id: s.id, name: s.name })),
      });
    }

    const opcoesNumeradas = subcategorias.map((s, i) => `${i + 1}) ${s.name}`).join('\n');
    return `Não encontrei a subcategoria "${nomeSubcategoria}" em *${ultimo.category?.name}*.\n\n`
      + `${opcoesNumeradas}\n\nResponda com o número, o nome, ou *pular*.`;
  }

  await updateTransaction(dados, ultimo.id, { subcategoryId: alvo.id });
  return `✅ Subcategoria de "${ultimo.description}" (${moeda(ultimo.amount)}) alterada para *${alvo.name}*.`;
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

// Correção conversacional: só reage quando a mensagem INTEIRA é um destes
// termos — "nossa, que dia errado" não pode virar um apagar acidental. Cada
// termo é a mensagem sozinha, do jeito que alguém manda logo depois de ver
// que o lançamento saiu errado.
const GATILHOS_APAGAR = [
  'apagar ultimo', 'desfazer', 'errado', 'esta errado', 'ta errado',
  'errou', 'apagar', 'apaga', 'cancela', 'cancelar', 'lancamento errado',
];

/**
 * A mensagem é um comando? Função PURA — não toca no banco e não executa nada.
 *
 * RECONHECER E EXECUTAR SÃO COISAS DIFERENTES, e misturá-las custou um bug.
 * O webhook precisa saber se a mensagem casou com um comando ANTES de rotear,
 * porque a decisão depende disso. Enquanto reconhecer significava executar,
 * o efeito acontecia mesmo quando o roteador mandava a mensagem para outro
 * lugar: "Nina, categoria moradia" mudava a categoria do último lançamento e
 * só DEPOIS ia para a conversa; e uma resposta à Nina que começasse com
 * "categoria..." era engolida pelo comando (teste ao vivo de 21/08/2026).
 *
 * @returns {{tipo: string, argumento: string|null}|null}
 */
function reconhecerComando(texto, { householdId } = {}) {
  const limpo = normalizar(texto);

  if (limpo.startsWith('vincular')) {
    return { tipo: 'VINCULAR', argumento: limpo.split(/\s+/)[1] || null };
  }

  // Os demais exigem família já vinculada.
  if (!householdId) return null;

  if (limpo === 'resumo' || limpo === 'resumo mes' || limpo === 'resumo do mes') {
    return { tipo: 'RESUMO', argumento: null };
  }
  if (limpo === 'ultimos' || limpo === 'ultimos lancamentos') {
    return { tipo: 'ULTIMOS', argumento: null };
  }
  if (GATILHOS_APAGAR.includes(limpo)) {
    return { tipo: 'APAGAR_ULTIMO', argumento: null };
  }
  if (limpo.startsWith('subcategoria ') || limpo.startsWith('mudar subcategoria ') || limpo.startsWith('trocar subcategoria ')) {
    return {
      tipo: 'MUDAR_SUBCATEGORIA',
      argumento: limpo.replace(/^(mudar\s+|trocar\s+)?subcategoria\s+(para\s+)?/, '').trim(),
    };
  }
  if (limpo.startsWith('categoria ') || limpo.startsWith('mudar categoria ') || limpo.startsWith('trocar categoria ')) {
    return {
      tipo: 'MUDAR_CATEGORIA',
      argumento: limpo.replace(/^(mudar\s+|trocar\s+)?categoria\s+(para\s+)?/, '').trim(),
    };
  }
  if (limpo === 'categorias') {
    return { tipo: 'CATEGORIAS', argumento: null };
  }
  if (limpo === 'ajuda' || limpo === 'help' || limpo === 'comandos') {
    return { tipo: 'AJUDA', argumento: null };
  }

  return null;
}

/** Executa o que `reconhecerComando` identificou. Só quem decidiu chama. */
async function executarComando(comando, { householdId, remoteJid, senderJid }) {
  if (!comando) return null;

  switch (comando.tipo) {
    case 'VINCULAR': return comandoVincular(comando.argumento, remoteJid);
    case 'RESUMO': return comandoResumo(householdId);
    case 'ULTIMOS': return comandoUltimos(householdId);
    case 'APAGAR_ULTIMO': return comandoApagarUltimo(householdId);
    case 'MUDAR_SUBCATEGORIA':
      return comandoMudarSubcategoria(householdId, comando.argumento, senderJid);
    case 'MUDAR_CATEGORIA':
      return comandoMudarCategoria(householdId, comando.argumento);
    case 'CATEGORIAS': return comandoCategorias(householdId);
    case 'AJUDA': return AJUDA;
    default: return null;
  }
}

/**
 * Interpreta e executa numa passada. Devolve null quando não é comando.
 *
 * Continua existindo para quem só quer a resposta e não participa do
 * roteamento. O webhook NÃO usa: lá as duas metades são separadas de
 * propósito (ver `reconhecerComando`).
 */
async function tratarComando(texto, { householdId, remoteJid, senderJid }) {
  const comando = reconhecerComando(texto, { householdId });
  if (!comando) return null;

  return executarComando(comando, { householdId, remoteJid, senderJid });
}

module.exports = {
  tratarComando,
  reconhecerComando,
  executarComando,
  gerarCodigoVinculo,
  AJUDA,
  normalizar,
};
