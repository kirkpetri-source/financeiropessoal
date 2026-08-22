/**
 * Quem é avisado quando um chamado se mexe.
 *
 * REGRA QUE MANDA EM TUDO AQUI: **nenhum aviso carrega conteúdo do chamado.**
 * Nem o texto da mensagem, nem o assunto que o cliente escreveu. O corpo diz o
 * número e leva o link; a conversa inteira mora no sistema.
 *
 * Isso não é zelo excessivo. O assunto é escrito pelo cliente e pode ser
 * "não consigo pagar, fiquei desempregado" — uma linha dessas na caixa de
 * entrada de alguém, ou numa prévia de notificação de celular que qualquer um
 * lê por cima do ombro, é vazamento de dado sensível por conveniência. Existe
 * teste afirmando isso sobre o corpo EFETIVAMENTE enviado, não sobre a intenção.
 *
 * Nada aqui lança. Falha de envio é registrada em `notificacoesNaoEntregues` e
 * aparece na aba do operador — erro só no log some, e ninguém descobre que o
 * cliente ficou esperando uma resposta que nunca foi avisada.
 *
 * E nada aqui roda dentro de transação: persiste primeiro, notifica depois.
 */

const { montarAviso } = require('../chamados/emailDeAviso');

const TIPOS = {
  CHAMADO_NOVO: 'CHAMADO_NOVO',
  SUPORTE_RESPONDEU: 'SUPORTE_RESPONDEU',
  CLIENTE_RESPONDEU: 'CLIENTE_RESPONDEU',
  ENCAMINHADO: 'ENCAMINHADO',
};

const CANAIS = { EMAIL: 'EMAIL', WHATSAPP: 'WHATSAPP' };

const COLECAO_FALHAS = 'notificacoesNaoEntregues';

function criarNotificacaoChamadoService({
  emailService,
  avisarOperador,
  getRawConfig,
  enviarWhatsapp,
  buscarEmailDoDono,
  registrarFalha,
  emailDaEquipe,
  urlBase,
}) {
  const linkDoCliente = (numero) => `${String(urlBase || '').replace(/\/$/, '')}/suporte/${numero}`;
  const linkDoOperador = () => `${String(urlBase || '').replace(/\/$/, '')}/plataforma`;

  /** Registra a falha sem nunca derrubar quem chamou. */
  async function anotar(dados) {
    try {
      await registrarFalha(dados);
    } catch (err) {
      console.error('[NotificacaoChamado] Nem a falha conseguiu ser registrada:', err.message);
    }
  }

  async function porEmail({ tipo, numero, householdId, para, assunto, texto, html }) {
    const r = await emailService.enviar({ para, assunto, texto, html });

    if (!r.enviado && r.motivo !== 'desligado') {
      await anotar({
        tipo, numero, householdId, canal: CANAIS.EMAIL,
        destinatario: para || null, erro: r.erro || r.motivo,
      });
    }

    return r;
  }

  async function porWhatsappDoOperador({ tipo, numero, householdId, texto }) {
    const r = await avisarOperador(texto, `aviso do chamado #${numero}`);

    if (!r.enviado && r.motivo !== 'desligado') {
      await anotar({
        tipo, numero, householdId, canal: CANAIS.WHATSAPP,
        destinatario: 'operador', erro: r.erro || r.motivo,
      });
    }

    return r;
  }

  /**
   * WhatsApp da família do CLIENTE.
   *
   * Prefere o número do dono ao grupo: só o dono abre o chamado no painel, e um
   * aviso no grupo apareceria para quem não tem como agir sobre ele. Se a
   * família só tem grupo, vai para o grupo — o aviso não carrega conteúdo, então
   * não expõe nada.
   */
  async function porWhatsappDaFamilia({ tipo, numero, householdId, texto }) {
    try {
      const config = await getRawConfig(householdId);

      if (!config || !config.enabled) {
        // Família sem canal ativo não é falha de entrega: ela simplesmente não
        // usa WhatsApp. Registrar isso encheria a tela do operador de ruído.
        return { enviado: false, motivo: 'canal-inativo' };
      }

      const destino = config.ownerJid || config.groupId || null;
      if (!destino) return { enviado: false, motivo: 'sem-destino' };

      const r = await enviarWhatsapp(householdId, config, destino, texto);

      if (!r?.enviado) {
        await anotar({
          tipo, numero, householdId, canal: CANAIS.WHATSAPP,
          destinatario: destino, erro: r?.erro || 'falha-envio',
        });
        return { enviado: false, motivo: 'falha-envio', erro: r?.erro || null };
      }

      return { enviado: true };
    } catch (err) {
      await anotar({
        tipo, numero, householdId, canal: CANAIS.WHATSAPP,
        destinatario: null, erro: err.message,
      });
      return { enviado: false, motivo: 'erro', erro: err.message };
    }
  }

  // ---------------------------------------------------------------------------
  // Os quatro eventos
  // ---------------------------------------------------------------------------

  /** Cliente abriu. Avisa a equipe pelos dois canais. */
  async function chamadoNovo({ numero, householdId }) {
    const tipo = TIPOS.CHAMADO_NOVO;

    // O WhatsApp fica em texto curto — lá não existe HTML. O e-mail vai com a
    // identidade visual, montada pelo mesmo template dos quatro avisos.
    const texto = [
      `Chamado #${numero} aberto no RevelaCash.`,
      '',
      `Abra o painel para ler e responder: ${linkDoOperador()}`,
    ].join('\n');

    const aviso = montarAviso({
      numero,
      assunto: `Chamado #${numero} aberto`,
      titulo: 'Um cliente abriu um chamado.',
      explicacao: 'Abra o painel para ler e responder.',
      link: linkDoOperador(),
      rotuloDoBotao: 'Abrir o painel',
      paraOperador: true,
    });

    await Promise.all([
      porEmail({
        tipo, numero, householdId, para: emailDaEquipe,
        assunto: aviso.assunto, texto: aviso.texto, html: aviso.html,
      }),
      porWhatsappDoOperador({ tipo, numero, householdId, texto }),
    ]);
  }

  /** Cliente respondeu um chamado que já existia. Avisa a equipe. */
  async function clienteRespondeu({ numero, householdId }) {
    const tipo = TIPOS.CLIENTE_RESPONDEU;

    const texto = [
      `O cliente respondeu no chamado #${numero}.`,
      '',
      `Abra o painel para ler: ${linkDoOperador()}`,
    ].join('\n');

    const aviso = montarAviso({
      numero,
      assunto: `Chamado #${numero} — nova resposta do cliente`,
      titulo: 'O cliente respondeu.',
      explicacao: 'Abra o painel para ler a resposta e continuar o atendimento.',
      link: linkDoOperador(),
      rotuloDoBotao: 'Abrir o painel',
      paraOperador: true,
    });

    await Promise.all([
      porEmail({
        tipo, numero, householdId, para: emailDaEquipe,
        assunto: aviso.assunto, texto: aviso.texto, html: aviso.html,
      }),
      porWhatsappDoOperador({ tipo, numero, householdId, texto }),
    ]);
  }

  /** Suporte respondeu. Avisa o DONO da conta, pelos dois canais. */
  async function suporteRespondeu({ numero, householdId, ownerId }) {
    const tipo = TIPOS.SUPORTE_RESPONDEU;

    const texto = [
      `Seu chamado #${numero} tem uma resposta do suporte.`,
      '',
      `Leia e responda em: ${linkDoCliente(numero)}`,
    ].join('\n');

    const email = await buscarEmailDoDono(ownerId).catch(() => null);

    const aviso = montarAviso({
      numero,
      assunto: `Seu chamado #${numero} teve resposta`,
      titulo: 'O suporte respondeu você.',
      explicacao: 'Abra o chamado para ler a resposta e continuar a conversa.',
      link: linkDoCliente(numero),
      rotuloDoBotao: 'Ver a resposta',
      paraOperador: false,
    });

    await Promise.all([
      porWhatsappDaFamilia({ tipo, numero, householdId, texto }),
      email
        ? porEmail({
          tipo, numero, householdId, para: email,
          assunto: aviso.assunto, texto: aviso.texto, html: aviso.html,
        })
        : Promise.resolve(),
    ]);
  }

  /**
   * Encaminhado para outro operador.
   *
   * O e-mail vai para o endereço REAL do operador — e cai na caixa da equipe
   * quando ele não tem um. O login de operador é um e-mail interno
   * (`@operador.revelacash.internal`) que ninguém lê: mandar para lá seria
   * mandar para o vazio com cara de entregue. A spec não previu isso porque o
   * detalhe só aparece olhando como o login é criado.
   */
  async function chamadoEncaminhado({ numero, householdId, para }) {
    const tipo = TIPOS.ENCAMINHADO;

    const destino = para?.email || emailDaEquipe;

    const aviso = montarAviso({
      numero,
      assunto: `Chamado #${numero} encaminhado`,
      titulo: `Encaminhado para ${para?.nome || 'outro operador'}.`,
      explicacao: 'Abra o painel para assumir o atendimento.',
      link: linkDoOperador(),
      rotuloDoBotao: 'Abrir o painel',
      paraOperador: true,
    });

    await porEmail({
      tipo, numero, householdId, para: destino,
      assunto: aviso.assunto, texto: aviso.texto, html: aviso.html,
    });
  }

  return {
    chamadoNovo,
    clienteRespondeu,
    suporteRespondeu,
    chamadoEncaminhado,
    TIPOS,
    CANAIS,
  };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { admin, db } = require('../config/firebaseAdmin');
    const emailService = require('./emailService');
    const whatsappConfigService = require('./whatsappConfigService');
    const respostaWhatsapp = require('./respostaWhatsapp');
    const { criarNotificador } = require('./notificacaoOperadorService');

    // Variável própria, com o aviso de cadastro como padrão: o canal é o mesmo
    // (a auto-conversa do operador), mas separar permite mudar um sem o outro.
    const householdDoOperador = process.env.SUPORTE_WHATSAPP_HOUSEHOLD_ID
      || process.env.NOTIFICACAO_CADASTRO_HOUSEHOLD_ID
      || null;

    const notificador = criarNotificador({
      getRawConfig: whatsappConfigService.getRawConfig,
      enviarWhatsapp: respostaWhatsapp.responder,
      householdIdDoOperador: householdDoOperador,
      destinoForcado: process.env.NOTIFICACAO_CADASTRO_DESTINO_JID || null,
    });

    _padrao = criarNotificacaoChamadoService({
      emailService,
      avisarOperador: notificador.avisarOperador,
      getRawConfig: whatsappConfigService.getRawConfig,
      enviarWhatsapp: respostaWhatsapp.responder,
      buscarEmailDoDono: async (uid) => {
        if (!uid) return null;
        const usuario = await admin.auth().getUser(uid).catch(() => null);
        return usuario?.email || null;
      },
      registrarFalha: async (dados) => {
        await db.collection(COLECAO_FALHAS).add({
          ...dados,
          resolvida: false,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
      },
      emailDaEquipe: process.env.SUPORTE_EMAIL_DESTINO || null,
      urlBase: process.env.APP_URL || 'https://revelacash.com.br',
    });
  }
  return _padrao;
}

/**
 * NÃO EXISTE "disparar e esquecer" AQUI, e isso é deliberado.
 *
 * A vontade natural é mandar a notificação sem esperar, para a resposta HTTP
 * sair rápido. **No Cloud Run isso não funciona**: a CPU é congelada assim que
 * a resposta sai, e a promessa pendente morre no meio, sem deixar erro no log.
 * O projeto já pagou exatamente por isso — a primeira versão do webhook do
 * WhatsApp respondia 200 na primeira linha e perdia o processamento.
 *
 * Então quem chama AGUARDA. O custo é a resposta demorar o tempo do e-mail; e
 * como nada aqui lança, esperar não traz risco de virar 500 num chamado que já
 * foi gravado.
 */

module.exports = {
  criarNotificacaoChamadoService,
  TIPOS,
  CANAIS,
  COLECAO_FALHAS,
  chamadoNovo: (...a) => servico().chamadoNovo(...a),
  clienteRespondeu: (...a) => servico().clienteRespondeu(...a),
  suporteRespondeu: (...a) => servico().suporteRespondeu(...a),
  chamadoEncaminhado: (...a) => servico().chamadoEncaminhado(...a),
};
