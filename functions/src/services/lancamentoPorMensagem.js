const { db } = require('../config/firebaseAdmin');
const { escopoDe } = require('../data/escopo');
const { parseFinancialMessage, looksLikeFinancialMessage } = require('../utils/financialParser');
const { detectarParcelamento, montarParcelas } = require('../utils/parcelamento');
const { parseWithAI } = require('./aiParserService');
const { verificarLimiteDeIA } = require('./limiteIAService');
const { createTransaction } = require('./transactionService');
const householdService = require('./householdService');
const { situacaoDaAssinatura, mensagemDaSituacao } = require('../assinatura/estado');

const MENSAGEM_LIMITE_IA = 'Limite diário de lançamentos por IA atingido para esta família.\n\n'
  + 'Lançamentos no formato direto continuam funcionando sem limite:\n'
  + '• gastei 84,90 no mercado\n'
  + '• paguei 50 de gasolina no pix\n'
  + '• recebi 2500 de salário';

/**
 * Transforma uma mensagem de texto em lançamento(s), para a família certa.
 *
 * Ficava duplicado entre o webhook e o polling — duas cópias que precisavam ser
 * corrigidas juntas e que já tinham divergido (a data do lançamento, por
 * exemplo: o webhook usava a hora do processamento, o polling a hora da
 * mensagem). Agora existe um caminho só.
 */

/**
 * Localiza a família dona de um grupo do WhatsApp (ou da instância, no chat privado).
 *
 * A config sai por `configEfetiva`, e não crua do documento: a família
 * provisionada pelo sistema não guarda URL nem API key, e sem isso a resposta
 * de confirmação falharia em silêncio no catch do respostaWhatsapp.
 */
async function acharHouseholdPorOrigem(remoteJid, instanceName) {
  const { configEfetiva } = require('../config/evolutionServidor');
  const ehGrupo = remoteJid?.endsWith('@g.us');

  if (ehGrupo && remoteJid) {
    const snap = await db.collection('whatsappConfigs')
      .where('enabled', '==', true)
      .where('groupId', '==', remoteJid)
      .limit(1).get();
    if (!snap.empty) return { householdId: snap.docs[0].id, config: configEfetiva(snap.docs[0].data()) };
  }

  if (!ehGrupo && instanceName) {
    const snap = await db.collection('whatsappConfigs')
      .where('enabled', '==', true)
      .where('instanceName', '==', instanceName)
      .where('allowPrivateChat', '==', true)
      .limit(1).get();

    if (!snap.empty) {
      const dados = snap.docs[0].data();

      // TRAVA DO MODO INDIVIDUAL.
      //
      // Neste modo o robô roda no número do próprio cliente, então TODA conversa
      // privada dele chega aqui. Sem esta verificação, um amigo mandando
      // "te devo 50" viraria despesa no financeiro da família.
      //
      // Só a auto-conversa vale — o "Mensagens para mim mesmo" do WhatsApp, onde
      // o destinatário é o próprio número. É lá que o cliente lança.
      if (dados.ownerJid) {
        const proprio = String(dados.ownerJid).replace(/@.*/, '').replace(/\D/g, '');
        const destino = String(remoteJid || '').replace(/@.*/, '').replace(/\D/g, '');
        if (!proprio || !destino || proprio !== destino) return null;
      }

      return { householdId: snap.docs[0].id, config: configEfetiva(dados) };
    }
  }

  return null;
}

async function resolverCategoriaId(dados, nomeCategoria) {
  const [padrao, daFamilia] = await Promise.all([
    dados.consultarPadroes('categories').where('name', '==', nomeCategoria).limit(1).get(),
    dados.consultar('categories').where('name', '==', nomeCategoria).limit(1).get(),
  ]);
  if (!daFamilia.empty) return daFamilia.docs[0].id;
  if (!padrao.empty) return padrao.docs[0].id;

  const reserva = await dados.consultarPadroes('categories').where('name', '==', 'Outros').limit(1).get();
  return reserva.empty ? null : reserva.docs[0].id;
}

async function resolverFormaPagamentoId(dados, nomeForma) {
  const nome = nomeForma || 'Pix';
  const [padrao, daFamilia] = await Promise.all([
    dados.consultarPadroes('paymentMethods').where('name', '==', nome).limit(1).get(),
    dados.consultar('paymentMethods').where('name', '==', nome).limit(1).get(),
  ]);
  if (!daFamilia.empty) return daFamilia.docs[0].id;
  if (!padrao.empty) return padrao.docs[0].id;

  const reserva = await dados.consultarPadroes('paymentMethods').where('name', '==', 'Outro').limit(1).get();
  return reserva.empty ? null : reserva.docs[0].id;
}

/**
 * Decide quem pagou:
 *   1. nome escrito na mensagem      — o mais explícito ganha
 *   2. telefone do remetente         — identificação automática
 *   3. nome do perfil, SÓ se bater com algum membro cadastrado
 *
 * O passo 3 antes aceitava o pushName cru. Como o perfil costuma ter nome
 * completo e enfeite ("Kirk Douglas - Lion Tech"), isso criava pagadores
 * fantasma que apareciam separados nos gráficos de gastos por pessoa.
 */
async function resolverPagador(householdId, nomeNaMensagem, senderJid, pushName) {
  if (nomeNaMensagem) return nomeNaMensagem;

  const porTelefone = await householdService.acharMembroPorTelefone(
    householdId,
    senderJid ? senderJid.replace(/@.*/, '') : null
  );
  if (porTelefone) return porTelefone.name;

  const membros = await householdService.listarMembros(householdId);

  if (pushName) {
    const perfil = String(pushName).toLowerCase();
    const casou = membros.find((m) => m.name && perfil.includes(String(m.name).toLowerCase()));
    if (casou) return casou.name;
  }

  // Família de uma pessoa só: o gasto é dela, ponto. Sem isso, quem usa
  // sozinho via chat privado ficava com TODOS os lançamentos sem dono — que foi
  // exatamente o que aconteceu nos 14 primeiros lançamentos de teste.
  if (membros.length === 1 && membros[0].name) return membros[0].name;

  return null;
}

/**
 * Assinatura vencida bloqueia o lançamento também pelo WhatsApp — senão o
 * canal principal do produto vira uma porta dos fundos para usar de graça.
 * Devolve a mensagem a mandar no grupo, ou null quando está tudo em dia.
 */
async function bloqueioPorAssinatura(householdId) {
  const doc = await db.collection('households').doc(householdId).get();
  if (!doc.exists) return 'Família não encontrada.';

  const situacao = situacaoDaAssinatura(doc.data().subscription, new Date());
  return situacao.podeLancar ? null : mensagemDaSituacao(situacao);
}

/**
 * Interpreta o texto e cria os lançamentos.
 * @returns {Promise<{transacoes: string[], erro: string|null}>}
 */
const ORIGEM_LABEL = { AUDIO: 'áudio transcrito', IMAGE: 'foto de cupom' };

async function lancarPorTexto({ householdId, texto, senderJid, pushName, dataDaMensagem, origem, origin = 'WHATSAPP' }) {
  const bloqueio = await bloqueioPorAssinatura(householdId);
  if (bloqueio) return { transacoes: [], criadas: [], erro: bloqueio, bloqueado: true };

  const dados = escopoDe(householdId);

  const membros = await householdService.listarMembros(householdId);
  const nomesDosMembros = membros.map((m) => m.name).filter(Boolean);

  // Parcelamento sai do texto ANTES de interpretar: senao o parser le o "10x"
  // como se fosse o valor da compra.
  const parcelado = detectarParcelamento(texto);
  const textoParaParser = parcelado ? parcelado.textoLimpo : texto;

  // 1) regras (rápido e grátis)  2) IA, só se as regras não derem conta
  let interpretados = [];
  const porRegra = parseFinancialMessage(textoParaParser, nomesDosMembros);
  if (porRegra) {
    interpretados = [porRegra];
  } else {
    const permitido = await verificarLimiteDeIA(householdId);
    if (!permitido) {
      return { transacoes: [], criadas: [], erro: MENSAGEM_LIMITE_IA };
    }

    const porIA = await parseWithAI(textoParaParser, nomesDosMembros);
    if (Array.isArray(porIA)) interpretados = porIA;
  }

  if (!interpretados.length) {
    return {
      transacoes: [],
      // O erro precisa ensinar a regra, não só reclamar: começar dizendo se
      // gastou ou recebeu é o que faz a mensagem ser entendida.
      erro: `Não entendi "${texto}".\n\n`
        + 'Comece dizendo se gastou ou recebeu:\n'
        + '• gastei 84,90 no mercado\n'
        + '• paguei 50 de gasolina no pix\n'
        + '• recebi 2500 de salário',
    };
  }

  const ids = [];
  // As transações completas (com categoria já resolvida) sobem junto: a
  // confirmação no WhatsApp precisa do nome da categoria, não só do ID.
  const criadas = [];

  for (const item of interpretados) {
    const [categoryId, paymentMethodId] = await Promise.all([
      resolverCategoriaId(dados, item.categoryName),
      resolverFormaPagamentoId(dados, item.paymentMethodName),
    ]);
    if (!categoryId || !paymentMethodId) continue;

    const paidBy = await resolverPagador(householdId, item.paidBy, senderJid, pushName);

    const comum = {
      type: item.type,
      categoryId,
      paymentMethodId,
      notes: origin === 'WHATSAPP' ? `Via WhatsApp (${origem}).` : `Via WhatsApp (${origem}), ${ORIGEM_LABEL[origin] || origin}.`,
      origin,
      status: 'CONFIRMED',
      paidBy,
    };

    // Compra parcelada vira N lançamentos, um por mês. Só faz sentido para
    // despesa: "recebi 300 em 3x" é raro e ambíguo demais para adivinhar.
    if (parcelado && item.type === 'EXPENSE') {
      const parcelas = montarParcelas({
        descricao: item.description,
        valorTotal: item.amount,
        parcelas: parcelado.parcelas,
        dataDaCompra: dataDaMensagem,
      });

      for (const p of parcelas) {
        const transacao = await createTransaction(dados, {
          ...comum,
          description: p.description,
          amount: p.amount,
          date: p.date,
          parcela: p.parcela,
          totalParcelas: p.totalParcelas,
          grupoParcelamento: p.grupoParcelamento,
          valorTotalParcelamento: p.valorTotal,
        });
        ids.push(transacao.id);
        // Só a primeira parcela entra na confirmação — as outras são
        // consequência dela, e listar dez linhas no grupo seria ruído.
        if (p.parcela === 1) criadas.push({ ...transacao, _parcelamento: parcelado.parcelas });
      }
      continue;
    }

    const transacao = await createTransaction(dados, {
      ...comum,
      description: item.description,
      amount: item.amount,
      // Sempre a hora da MENSAGEM, nunca a do processamento. O webhook usava a
      // hora do processamento e um gasto enviado 23h58 podia cair no dia — e no
      // mês — errado, dependendo de por onde a mensagem entrasse.
      date: dataDaMensagem,
    });
    ids.push(transacao.id);
    criadas.push(transacao);
  }

  if (!ids.length) {
    return { transacoes: [], criadas: [], erro: 'Categoria ou forma de pagamento não encontrada.' };
  }

  return { transacoes: ids, criadas, erro: null };
}

/**
 * Áudio e foto de cupom passam pela IA multimodal (midiaParserService) para
 * virar uma frase em linguagem natural, e daí em diante seguem o MESMO
 * caminho do texto digitado — mesma resolução de categoria, forma de
 * pagamento e pagador, e mesmo bloqueio por assinatura vencida.
 */
async function lancarPorAudio({ householdId, base64, mimeType, senderJid, pushName, dataDaMensagem, origem }) {
  const bloqueio = await bloqueioPorAssinatura(householdId);
  if (bloqueio) return { transacoes: [], criadas: [], erro: bloqueio, bloqueado: true };

  const permitido = await verificarLimiteDeIA(householdId);
  if (!permitido) return { transacoes: [], criadas: [], erro: MENSAGEM_LIMITE_IA };

  const { transcreverAudio } = require('./midiaParserService');
  const { texto, erro } = await transcreverAudio(base64, mimeType);
  if (erro) return { transacoes: [], criadas: [], erro };

  return lancarPorTexto({ householdId, texto, senderJid, pushName, dataDaMensagem, origem, origin: 'AUDIO' });
}

async function lancarPorCupom({ householdId, base64, mimeType, senderJid, pushName, dataDaMensagem, origem }) {
  const bloqueio = await bloqueioPorAssinatura(householdId);
  if (bloqueio) return { transacoes: [], criadas: [], erro: bloqueio, bloqueado: true };

  const permitido = await verificarLimiteDeIA(householdId);
  if (!permitido) return { transacoes: [], criadas: [], erro: MENSAGEM_LIMITE_IA };

  const { interpretarCupom } = require('./midiaParserService');
  const { texto, erro } = await interpretarCupom(base64, mimeType);
  if (erro) return { transacoes: [], criadas: [], erro };

  return lancarPorTexto({ householdId, texto, senderJid, pushName, dataDaMensagem, origem, origin: 'IMAGE' });
}

/** Já processamos essa mensagem? Evita lançamento duplicado (webhook + polling). */
async function jaProcessada(messageId) {
  if (!messageId) return true;
  const snap = await db.collection('whatsappLogs')
    .where('messageId', '==', messageId).limit(1).get();
  return !snap.empty;
}

module.exports = {
  acharHouseholdPorOrigem,
  bloqueioPorAssinatura,
  lancarPorTexto,
  lancarPorAudio,
  lancarPorCupom,
  jaProcessada,
  resolverPagador,
  looksLikeFinancialMessage,
};
