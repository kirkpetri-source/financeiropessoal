const { escopoDe } = require('../data/escopo');
const { updateLog } = require('../services/whatsappLogService');
const { criarLogUnico } = require('../services/logDeMensagem');
const {
  acharHouseholdPorOrigem,
  lancarPorTexto,
  lancarPorAudio,
  lancarPorCupom,
  transcreverAudioDaMensagem,
  jaProcessada,
  looksLikeFinancialMessage,
  tentarResolverConfirmacaoPendente,
  telefoneEfetivo,
} = require('../services/lancamentoPorMensagem');
const { tratarComando, reconhecerComando, executarComando } = require('../services/comandosWhatsapp');
const { responder, confirmarLancamentos, ehMensagemDoBot } = require('../services/respostaWhatsapp');
const { provedorDe } = require('../canais');
const { decidirSemIA, decidirComIntencao, pareceperguntaOuPedido, DESTINO } = require('../utils/roteadorMensagem');
const { parseFinancialMessage } = require('../utils/financialParser');
const assistenteService = require('../services/assistenteService');
const { NOME_PADRAO } = require('../utils/nomeDaAssistente');

/**
 * Conversa com a assistente e devolve a resposta pelo WhatsApp.
 *
 * O canal é bolha de mensagem, não tela: a resposta sai em formato de
 * WhatsApp (negrito com UM asterisco, poucas linhas), que é o que o `canal`
 * ajusta no prompt. Sem isso a resposta chega com "**asteriscos**" visíveis.
 *
 * Nunca derruba o webhook: se a assistente falhar, a pessoa recebe um aviso
 * curto em vez de silêncio.
 *
 * `logExistente` é obrigatório quando quem chama JÁ registrou a mensagem. O
 * caminho de fallback (a IA classificou como pergunta depois de tentar
 * interpretar como lançamento) é exatamente esse caso: sem reaproveitar, a
 * mesma mensagem virava DOIS registros em `whatsappLogs`, com 1 a 2 segundos
 * de diferença. Achado nos logs do teste ao vivo de 18/08/2026 — 12 de 12
 * perguntas duplicadas, todas por aqui, nenhuma por reentrega do webhook.
 */
async function conversarComAssistente({
  householdId, config, msg, texto, nomeDaAssistente, logExistente = null,
}) {
  const dados = escopoDe(householdId);

  let log = logExistente;

  if (!log) {
    const registro = await criarLogUnico(dados, {
      messageId: msg.messageId,
      groupId: msg.remoteJid,
      sender: msg.pushName || 'você',
      messageType: 'TEXT',
      content: msg.content,
      processingStatus: 'PENDING',
    });

    // Outra execução chegou primeiro com esta mesma mensagem — ela é que
    // responde. Duas respostas para a mesma pergunta é pior que uma.
    if (!registro.criado) return;
    log = registro.log;
  }

  try {
    // Quem está falando: no modo individual `senderJid` nunca vem preenchido
    // (trava documentada do projeto), então cai para o dono do canal — sem
    // isso a memória de conversa não separaria as pessoas do grupo.
    const interlocutor = await telefoneEfetivo(msg.senderJid, householdId) || 'desconhecido';

    const r = await assistenteService.responder({
      householdId,
      pergunta: texto,
      interlocutor: `wa-${interlocutor}`,
      // Pelo WhatsApp quem fala já é membro autorizado da família, e lançar por
      // mensagem sempre foi permitido a eles.
      permissoes: { lancar: true },
      nomeDaIA: nomeDaAssistente,
      canal: 'WHATSAPP',
    });

    const resposta = r.texto || r.erro;
    await responder(householdId, config, msg.remoteJid, resposta);
    await updateLog(dados, log.id, { processingStatus: 'PROCESSED' });
  } catch (err) {
    console.error(`[Assistente] Falha ao responder ${householdId}: ${err.message}`);
    await updateLog(dados, log.id, { processingStatus: 'ERROR', errorMessage: err.message });
    await responder(householdId, config, msg.remoteJid,
      'Não consegui responder agora. Tente de novo em instantes — seus lançamentos estão salvos.');
  }
}

/**
 * Webhook do Evolution — porta de entrada instantânea das mensagens.
 * O polling agendado cobre o mesmo caminho como rede de segurança; a
 * deduplicação por messageId impede que os dois lancem a mesma coisa.
 */

function extrairMensagem(payload) {
  try {
    const data = payload.data || payload;
    const fromMe = data.key?.fromMe || false;
    const remoteJid = data.key?.remoteJid || null;

    let content = null;
    let messageType = 'TEXT';

    if (data.message?.conversation) {
      content = data.message.conversation;
    } else if (data.message?.extendedTextMessage?.text) {
      content = data.message.extendedTextMessage.text;
    } else if (data.message?.imageMessage) {
      content = data.message.imageMessage.caption || null;
      messageType = 'IMAGE';
    } else if (data.message?.audioMessage) {
      messageType = 'AUDIO';
    } else if (data.message?.documentMessage || data.message?.videoMessage) {
      messageType = 'DOCUMENT';
    } else if (data.message?.stickerMessage) {
      messageType = 'STICKER';
    }

    return {
      messageId: data.key?.id || null,
      // A chave completa (id + remoteJid + fromMe + participant) é o que a
      // Evolution exige para baixar o binário de áudio/imagem depois —
      // guardar só o id não bastaria.
      key: data.key || null,
      remoteJid,
      fromMe,
      // Em grupo o remetente vem em key.participant; em conversa privada é o remoteJid.
      senderJid: data.key?.participant || (fromMe ? null : remoteJid) || null,
      pushName: data.pushName || null,
      timestamp: data.messageTimestamp || null,
      content,
      messageType,
      instanceName: payload.instance || null,
    };
  } catch {
    return {
      messageId: null, key: null, remoteJid: null, fromMe: false, senderJid: null, pushName: null,
      timestamp: null, content: null, messageType: 'TEXT', instanceName: null,
    };
  }
}

/**
 * O trabalho de verdade. Separado do handler porque precisa terminar ANTES da
 * resposta HTTP (ver o comentário em handleEvolutionWebhook).
 */
async function processarMensagemRecebida(req) {
  const msg = extrairMensagem(req.body);

  // PROTEÇÃO CONTRA LOOP — antes de qualquer coisa.
  // O bot roda no mesmo número do usuário, então a confirmação que ele envia
  // volta por aqui como fromMe. Como o texto tem "R$" e número, passaria pelo
  // filtro financeiro e viraria um lançamento novo, gerando outra confirmação,
  // e assim por diante. A assinatura invisível corta o ciclo já na entrada.
  if (ehMensagemDoBot(msg.content)) return;

  const encontrado = await acharHouseholdPorOrigem(msg.remoteJid, msg.instanceName);

  // "vincular CODIGO" é o único comando que funciona antes de o grupo ser
  // conhecido — é justamente ele que torna o grupo conhecido.
  if (!encontrado) {
    if (msg.messageType === 'TEXT' && msg.content) {
      const resposta = await tratarComando(msg.content, { householdId: null, remoteJid: msg.remoteJid });
      if (resposta) {
        const vinculado = await acharHouseholdPorOrigem(msg.remoteJid, msg.instanceName);
        if (vinculado) {
          await responder(vinculado.householdId, vinculado.config, msg.remoteJid, resposta);
        }
      }
    }
    return;
  }

  const { householdId, config } = encontrado;
  const dados = escopoDe(householdId);

  const ehPrivado = !msg.remoteJid?.endsWith('@g.us');
  const origem = ehPrivado ? 'chat privado' : 'grupo';

  const nomeDaAssistente = config?.nomeDaAssistente || NOME_PADRAO;
  const assistenteAtiva = assistenteService.ativa(householdId);

  /**
   * Quem está falando, no formato que a memória de conversa usa. Memorizado
   * porque `telefoneEfetivo` vai ao banco, e a fórmula precisa ser IDÊNTICA à
   * de `conversarComAssistente` — se as duas divergirem, a confirmação procura
   * a proposta na sessão errada e não acha nada.
   */
  let _interlocutor;
  async function interlocutorDaMensagem() {
    if (_interlocutor === undefined) {
      _interlocutor = `wa-${await telefoneEfetivo(msg.senderJid, householdId) || 'desconhecido'}`;
    }
    return _interlocutor;
  }

  /**
   * A pessoa está respondendo "sim" a uma proposta da assistente?
   *
   * Alterar e apagar acontecem em duas etapas: a Nina propõe, a pessoa
   * confirma. Só que a confirmação é quase sempre uma palavra — "sim", "ok",
   * "confirmo" — e o roteador matava isso de duas formas diferentes: "sim"
   * está na lista de conversa fiada e era descartado sem virar log; "confirmo"
   * passava, mas a IA classificava como OUTRO e o roteador mandava ignorar.
   * Resultado: a proposta ficava pendente para sempre e a pessoa não recebia
   * NADA — nem a alteração, nem um aviso. Achado no teste ao vivo de
   * 19/08/2026, com "Sim" e depois "Confirmo", os dois no vazio.
   *
   * Este desvio só é consultado nas mensagens que iam morrer de qualquer
   * jeito, DEPOIS de comando e regra de lançamento terem sido descartados.
   * Assim "gastei 50 no mercado" com uma proposta aberta continua virando
   * lançamento, e a regra 3 do roteador segue de pé.
   *
   * Mora AQUI, antes do bloco de mídia, porque o ÁUDIO precisa exatamente da
   * mesma defesa: falar "Sim" para confirmar uma exclusão caía no parser e
   * voltava "Não entendi 'Sim'" (teste ao vivo de 20/08/2026). Definido depois,
   * o áudio não alcançava — as variáveis de memória ainda estariam na zona
   * morta do `let`.
   */
  let _pendente;
  async function respondendoAProposta() {
    if (!assistenteAtiva) return false;
    if (_pendente === undefined) {
      _pendente = await assistenteService.temAcaoPendente({
        householdId,
        interlocutor: await interlocutorDaMensagem(),
      });
    }
    return _pendente;
  }

  /**
   * A Nina perguntou algo e esta mensagem é a resposta?
   *
   * Só é consultado quando o parser por REGRA não entendeu a mensagem — com
   * isso "gastei 45 no mercado" nem chega a ler o banco, e o caminho principal
   * do produto continua sem custo nenhum a mais.
   */
  async function respondendoAPergunta(texto) {
    if (!assistenteAtiva) return false;
    if (parseFinancialMessage(texto)) return false;

    return assistenteService.esperandoResposta({
      householdId,
      interlocutor: await interlocutorDaMensagem(),
    });
  }

  // Áudio (transcrito) e imagem (lida como cupom) viram lançamento igual ao
  // texto — passam pela IA multimodal e depois pelo MESMO caminho de
  // interpretação (ver lancamentoPorMensagem.lancarPorAudio/lancarPorCupom).
  // Funciona em grupo e no privado, igual o texto.
  if (msg.messageType === 'AUDIO' || msg.messageType === 'IMAGE') {
    if (await jaProcessada(msg.messageId)) return;

    const registro = await criarLogUnico(dados, {
      messageId: msg.messageId,
      groupId: msg.remoteJid,
      sender: msg.pushName || (msg.fromMe ? 'você' : 'desconhecido'),
      messageType: msg.messageType,
      content: null,
      processingStatus: 'PENDING',
      rawPayload: req.body,
    });
    if (!registro.criado) return;
    const log = registro.log;

    let midia = null;
    try {
      midia = await provedorDe(config).baixarMidia(config, msg.key);
    } catch (err) {
      console.error('[Webhook] Falha ao baixar mídia:', err.message);
    }

    if (!midia?.base64) {
      const erro = 'Não consegui baixar o arquivo enviado. Tente digitar o lançamento.';
      await updateLog(dados, log.id, { processingStatus: 'ERROR', errorMessage: erro });
      await responder(householdId, config, msg.remoteJid, `⚠️ ${erro}`);
      return;
    }

    const dataDaMensagem = msg.timestamp
      ? new Date(msg.timestamp * 1000).toISOString()
      : new Date().toISOString();

    // ÁUDIO PASSA PELO MESMO ROTEADOR DO TEXTO.
    //
    // Transcreve primeiro e decide depois, em vez de assumir que todo áudio é
    // lançamento. Sem isto, gravar "Nina, quanto gastei em mercado?" devolvia
    // "Não entendi..." com a lição de como escrever um gasto — o áudio era o
    // único canal onde perguntar não funcionava. Achado no teste ao vivo de
    // 19/08/2026, quando um áudio pedindo alteração de categoria virou erro.
    //
    // A transcrição é reaproveitada nos dois caminhos: transcrever de novo
    // gastaria a chamada de IA mais cara do produto duas vezes na mesma
    // mensagem.
    let textoTranscrito = null;

    if (msg.messageType === 'AUDIO') {
      const t = await transcreverAudioDaMensagem({
        householdId, base64: midia.base64, mimeType: midia.mimetype,
      });

      if (t.erro) {
        await updateLog(dados, log.id, { processingStatus: 'ERROR', errorMessage: t.erro });
        if (!t.silencioso) await responder(householdId, config, msg.remoteJid, `⚠️ ${t.erro}`);
        return;
      }

      textoTranscrito = t.texto;
      // O que a pessoa falou fica no log: sem isso, áudio vira registro cego e
      // não dá para depurar nada do que aconteceu depois.
      await updateLog(dados, log.id, { content: textoTranscrito });

      // Resposta falada a uma pergunta de subcategoria — mesmo passo que o
      // texto dá antes de rotear.
      const confirmacaoFalada = await tentarResolverConfirmacaoPendente({
        householdId, senderJid: msg.senderJid, texto: textoTranscrito,
      });
      if (confirmacaoFalada.tratado) {
        await updateLog(dados, log.id, { processingStatus: 'PROCESSED' });
        await responder(householdId, config, msg.remoteJid, confirmacaoFalada.resposta);
        return;
      }

      const rotaDoAudio = decidirSemIA({
        texto: textoTranscrito,
        nomeDaAssistente,
        ehComando: false,
        aguardandoResposta: await respondendoAPergunta(textoTranscrito),
        assistenteAtiva,
      });

      if (rotaDoAudio.destino === DESTINO.CHAT) {
        await conversarComAssistente({
          householdId, config, msg, texto: rotaDoAudio.texto,
          nomeDaAssistente, logExistente: log,
        });
        return;
      }

      // CONVERSA FIADA FALADA NÃO VAI PARA O PARSER.
      //
      // Este é o MESMO filtro do texto, algumas dezenas de linhas abaixo — no
      // texto, "sim" e "bom dia" morrem em silêncio, ou viram confirmação
      // quando a Nina está esperando uma. No áudio não morriam: seguiam para
      // `lancarPorAudio` e voltavam "⚠️ Não entendi 'Sim'. Comece dizendo se
      // gastou ou recebeu", com a lição de como escrever um gasto. Aconteceu
      // duas vezes no teste ao vivo de 20/08/2026: um "Sim" que deveria
      // confirmar uma EXCLUSÃO já proposta, e um "Bom dia".
      const conversaFiadaFalada = rotaDoAudio.destino === DESTINO.IGNORAR
        || (rotaDoAudio.destino === null
            && !looksLikeFinancialMessage(textoTranscrito)
            && !(assistenteAtiva && pareceperguntaOuPedido(textoTranscrito)));

      if (conversaFiadaFalada) {
        if (await respondendoAProposta()) {
          await conversarComAssistente({
            householdId, config, msg, texto: textoTranscrito,
            nomeDaAssistente, logExistente: log,
          });
          return;
        }
        await updateLog(dados, log.id, { processingStatus: 'CANCELLED' });
        return;
      }
    }

    const lancar = msg.messageType === 'AUDIO' ? lancarPorAudio : lancarPorCupom;
    const { transacoes, criadas, erro, silencioso, intencaoDaIA, perguntaSubcategoria } = await lancar({
      householdId,
      base64: midia.base64,
      mimeType: midia.mimetype,
      senderJid: msg.senderJid,
      pushName: msg.pushName,
      dataDaMensagem,
      origem,
      textoTranscrito,
    });

    // Pergunta falada SEM o nome da assistente: o roteador não tinha como
    // saber, mas a IA que tentou interpretar já classificou de graça. Mesmo
    // caminho de fallback do texto — sem isto, quem grava "quanto gastei em
    // mercado?" ouve "Não entendi" mesmo com a assistente ligada.
    if (msg.messageType === 'AUDIO' && !transacoes.length && intencaoDaIA) {
      const nomeDaAssistenteAudio = config?.nomeDaAssistente || NOME_PADRAO;
      const rotaFinalDoAudio = decidirComIntencao({
        texto: textoTranscrito,
        intencao: intencaoDaIA,
        assistenteAtiva: assistenteService.ativa(householdId),
        temLancamentos: false,
      });

      if (rotaFinalDoAudio.destino === DESTINO.CHAT) {
        await conversarComAssistente({
          householdId, config, msg, texto: textoTranscrito,
          nomeDaAssistente: nomeDaAssistenteAudio, logExistente: log,
        });
        return;
      }
    }

    if (erro) {
      await updateLog(dados, log.id, { processingStatus: 'ERROR', errorMessage: erro });
      // Rate limit por família (limiteMensagensService) não gera resposta —
      // responder durante uma rajada só adiciona mais tráfego em cima dela.
      if (!silencioso) await responder(householdId, config, msg.remoteJid, `⚠️ ${erro}`);
      return;
    }

    await updateLog(dados, log.id, { processingStatus: 'PROCESSED', transactionId: transacoes[0] });
    await confirmarLancamentos(householdId, config, msg.remoteJid, criadas);

    // Subcategoria: mesma pergunta que o texto faz, no mesmo lugar do fluxo.
    if (perguntaSubcategoria) {
      await responder(householdId, config, msg.remoteJid, perguntaSubcategoria);
    }
    return;
  }

  // Documento e vídeo ainda não são interpretados. Registra como pendente só
  // no grupo, para ficar visível na tela; no privado ignora em silêncio.
  if (msg.messageType === 'DOCUMENT') {
    if (!ehPrivado && !(await jaProcessada(msg.messageId))) {
      const registro = await criarLogUnico(dados, {
        messageId: msg.messageId,
        groupId: msg.remoteJid,
        sender: msg.pushName || 'desconhecido',
        messageType: msg.messageType,
        content: msg.content,
        processingStatus: 'PENDING',
        rawPayload: req.body,
      });
      if (registro.criado) {
        await updateLog(dados, registro.log.id, {
          errorMessage: `Processamento de ${msg.messageType.toLowerCase()} ainda não implementado.`,
        });
      }
    }
    return;
  }

  if (msg.messageType !== 'TEXT' || !msg.content) return;

  // Antes de tratar como comando ou lançamento novo: pode ser a resposta a
  // uma pergunta de subcategoria que a IA fez na mensagem anterior. Single-
  // shot — se não bater com a pendência, ela é descartada e a mensagem segue
  // o caminho normal, tratada como se fosse nova.
  const confirmacao = await tentarResolverConfirmacaoPendente({
    householdId, senderJid: msg.senderJid, texto: msg.content,
  });
  if (confirmacao.tratado) {
    await responder(householdId, config, msg.remoteJid, confirmacao.resposta);
    return;
  }

  // Roteamento. A ordem está em utils/roteadorMensagem.js e é a garantia de
  // que nada do fluxo de lançamento regride: mensagem que o parser por regra
  // entende nunca chega perto da assistente.
  //
  // `nomeDaAssistente`, `assistenteAtiva`, `interlocutorDaMensagem()` e
  // `respondendoAProposta()` são definidos lá em cima, antes do bloco de
  // mídia, porque o áudio precisa dos mesmos.

  // O comando é RECONHECIDO antes de decidir, porque a decisão precisa saber
  // se casou — mas é EXECUTADO só quando o roteador manda para COMANDO.
  //
  // Antes as duas coisas eram uma só, e o efeito acontecia mesmo quando a
  // mensagem ia para outro lugar: "Nina, categoria moradia" mudava a categoria
  // do último lançamento e só então virava conversa.
  const comando = reconhecerComando(msg.content, { householdId });

  const rota = decidirSemIA({
    texto: msg.content,
    nomeDaAssistente,
    ehComando: !!comando,
    comandoComArgumento: !!comando?.argumento,
    aguardandoResposta: await respondendoAPergunta(msg.content),
    assistenteAtiva,
  });

  if (rota.destino === DESTINO.IGNORAR) return;

  if (rota.destino === DESTINO.COMANDO) {
    const respostaDeComando = await executarComando(comando, {
      householdId, remoteJid: msg.remoteJid, senderJid: msg.senderJid,
    });
    await responder(householdId, config, msg.remoteJid, respostaDeComando);
    return;
  }

  if (rota.destino === DESTINO.CHAT) {
    if (await jaProcessada(msg.messageId)) return;
    await conversarComAssistente({ householdId, config, msg, texto: rota.texto, nomeDaAssistente });
    return;
  }

  // Filtro barato antes de acionar a IA: conversa comum não vira lançamento.
  // Só vale para o caminho INDEFINIDO — o que casou a regra já passou direto.
  //
  // `looksLikeFinancialMessage` responde NÃO para toda pergunta (procura valor
  // e palavra de gasto, e "quanto gastei em mercado?" não tem valor). Sem o
  // segundo teste, perguntas sem o nome eram descartadas em SILÊNCIO, antes de
  // virar log — foi o que derrubou o primeiro teste ao vivo, em 18/08/2026.
  if (rota.destino === null
      && !looksLikeFinancialMessage(msg.content)
      && !(assistenteAtiva && pareceperguntaOuPedido(msg.content))) {
    // Último filtro antes do silêncio: "sim", "ok", "isso mesmo" são conversa
    // fiada — EXCETO quando a assistente acabou de propor uma alteração e está
    // esperando exatamente essa palavra.
    if (await respondendoAProposta()) {
      await conversarComAssistente({ householdId, config, msg, texto: msg.content, nomeDaAssistente });
      return;
    }
    return;
  }

  // Deduplicação: a mesma mensagem pode chegar por reenvio do Evolution e
  // também pelo polling. A pergunta abaixo evita o trabalho caro (IA, mídia)
  // quando a mensagem já foi tratada; quem garante que não duplica é a
  // gravação do log, que é atômica (ver services/logDeMensagem.js).
  if (await jaProcessada(msg.messageId)) return;

  const registro = await criarLogUnico(dados, {
    messageId: msg.messageId,
    groupId: msg.remoteJid,
    sender: msg.pushName || (msg.fromMe ? 'você' : 'desconhecido'),
    messageType: 'TEXT',
    content: msg.content,
    processingStatus: 'PENDING',
    rawPayload: req.body,
  });
  if (!registro.criado) return;
  const log = registro.log;

  const dataDaMensagem = msg.timestamp
    ? new Date(msg.timestamp * 1000).toISOString()
    : new Date().toISOString();

  const { transacoes, criadas, erro, silencioso, perguntaSubcategoria, intencaoDaIA } = await lancarPorTexto({
    householdId,
    texto: msg.content,
    senderJid: msg.senderJid,
    pushName: msg.pushName,
    dataDaMensagem,
    origem,
  });

  // A IA já classificou a mensagem na mesma chamada que tentou interpretá-la.
  // Se era pergunta, mandar para a assistente em vez de responder "não
  // entendi" — sem gastar uma segunda chamada de IA para descobrir isso.
  if (!transacoes.length && intencaoDaIA) {
    const rotaFinal = decidirComIntencao({
      texto: msg.content,
      intencao: intencaoDaIA,
      assistenteAtiva,
      temLancamentos: false,
    });

    if (rotaFinal.destino === DESTINO.CHAT) {
      // Reaproveita o log desta mensagem em vez de abrir outro: é a mesma
      // mensagem, só que agora sabemos que era pergunta. Quem fecha o status
      // é a própria conversa (PROCESSED no fim, ERROR se a assistente falhar).
      await conversarComAssistente({
        householdId, config, msg, texto: msg.content, nomeDaAssistente, logExistente: log,
      });
      return;
    }

    // "bom dia" não merece um "não entendi" — era conversa, não tentativa de
    // lançamento. Mas "confirmo" também cai aqui como OUTRO, e aí é o oposto
    // de conversa: é a resposta que a assistente está esperando.
    if (rotaFinal.destino === DESTINO.IGNORAR) {
      if (await respondendoAProposta()) {
        await conversarComAssistente({
          householdId, config, msg, texto: msg.content, nomeDaAssistente, logExistente: log,
        });
        return;
      }
      await updateLog(dados, log.id, { processingStatus: 'CANCELLED' });
      return;
    }
  }

  if (erro) {
    await updateLog(dados, log.id, { processingStatus: 'ERROR', errorMessage: erro });
    // Avisa que não entendeu, em vez de deixar o usuário no escuro achando
    // que registrou. O erro só aparecia numa tela que ninguém abre. Exceção:
    // rate limit por família (silencioso) não responde — não alimentar rajada.
    if (!silencioso) await responder(householdId, config, msg.remoteJid, `⚠️ ${erro}`);
    return;
  }

  await updateLog(dados, log.id, { processingStatus: 'PROCESSED', transactionId: transacoes[0] });

  // Fecha o ciclo: até agora o usuário lançava e não sabia se tinha entrado.
  await confirmarLancamentos(householdId, config, msg.remoteJid, criadas);

  // Segunda mensagem, só quando a IA não teve confiança pra escolher a
  // subcategoria sozinha — o lançamento já está feito, isto só refina depois.
  if (perguntaSubcategoria) {
    await responder(householdId, config, msg.remoteJid, perguntaSubcategoria);
  }
}

/**
 * O processamento acontece ANTES de responder — de propósito.
 *
 * A versão anterior respondia 200 na primeira linha e processava depois, para
 * o Evolution não reenviar. Só que Cloud Functions v2 roda sobre Cloud Run, e
 * lá a CPU é congelada assim que a resposta sai: o trabalho pendente
 * simplesmente morre no meio. Enquanto o processamento era curto, quase sempre
 * dava tempo; ao ganhar busca da família, comandos e confirmação, passou a ser
 * interrompido — a mensagem entrava, respondia 200 e nada acontecia. Nem erro
 * aparecia no log, porque o log também morria junto.
 *
 * Responder depois custa alguns segundos de latência para o Evolution e traz de
 * volta o risco de reenvio. Esse risco já está coberto pela deduplicação por
 * messageId, então é a troca certa: melhor uma resposta lenta que um lançamento
 * perdido em silêncio.
 */
async function handleEvolutionWebhook(req, res) {
  try {
    await processarMensagemRecebida(req);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook] Erro:', err);
    // 200 mesmo em erro: reenvio do Evolution não conserta erro nosso, só
    // repete o trabalho. O que falhou fica registrado no log da mensagem.
    res.status(200).json({ received: true, erro: err.message });
  }
}

module.exports = { handleEvolutionWebhook, processarMensagemRecebida, extrairMensagem };
