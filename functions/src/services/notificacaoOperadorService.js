/**
 * Aviso ao OPERADOR quando entra um cadastro novo.
 *
 * Não confundir com `adminMensagensService`, que fala com o CLIENTE. Aqui a
 * direção é a oposta: o sistema avisa o dono do negócio, pelo canal de WhatsApp
 * de uma família escolhida (a do próprio operador), que alguém acabou de se
 * cadastrar.
 *
 * Reusa a MESMA trilha de envio do bot (`respostaWhatsapp.responder`), o que
 * traz de graça a assinatura invisível anti-loop — sem ela, a mensagem caindo
 * na auto-conversa do operador voltaria pelo webhook e seria interpretada como
 * tentativa de lançamento.
 *
 * Desligado por padrão: sem `NOTIFICACAO_CADASTRO_HOUSEHOLD_ID` no ambiente,
 * `notificarCadastro` não faz nada e não custa nem uma leitura no Firestore. É
 * o que mantém o cadastro funcionando igual em teste, em conta descartável e em
 * qualquer ambiente que não seja a produção do operador.
 *
 * O ID da família fica em variável de ambiente, não no código: é dado do
 * operador, não regra de negócio.
 */

const { formatarCelular } = require('../utils/telefoneBR');

/**
 * Texto do aviso. Só nome e telefone, por decisão explícita — e-mail do cliente
 * não vai pro WhatsApp.
 */
function montarAvisoDeCadastro({ nome, telefone }) {
  const linhas = [
    'Novo cadastro no RevelaCash',
    '',
    `Nome: ${String(nome || '').trim() || 'não informado'}`,
    `WhatsApp: ${telefone ? formatarCelular(telefone) : 'não informado'}`,
  ];
  return linhas.join('\n');
}

/**
 * Para onde mandar. Preferência pelo número do dono do canal (auto-conversa do
 * operador) mesmo quando a família está em modo grupo: aviso de negócio não
 * pode cair no grupo da família, onde outras pessoas leem.
 */
function destinoDe(config, forcado = null) {
  return forcado || config?.ownerJid || config?.groupId || null;
}

function criarNotificador({ getRawConfig, enviarWhatsapp, householdIdDoOperador, destinoForcado = null }) {
  /**
   * Nunca lança. Um cadastro não pode falhar porque o WhatsApp do operador está
   * fora do ar — o cliente entrando é o que importa; o aviso é conveniência.
   */
  async function notificarCadastro({ nome, telefone }) {
    if (!householdIdDoOperador) return { enviado: false, motivo: 'desligado' };

    try {
      const config = await getRawConfig(householdIdDoOperador);
      if (!config || !config.enabled) {
        console.warn('[NotificacaoOperador] Canal do operador desativado ou inexistente; aviso de cadastro não enviado.');
        return { enviado: false, motivo: 'canal-inativo' };
      }

      const destino = destinoDe(config, destinoForcado);
      if (!destino) {
        console.warn('[NotificacaoOperador] Canal do operador sem número/grupo vinculado; aviso de cadastro não enviado.');
        return { enviado: false, motivo: 'sem-destino' };
      }

      const envio = await enviarWhatsapp(
        householdIdDoOperador,
        config,
        destino,
        montarAvisoDeCadastro({ nome, telefone }),
      );

      if (!envio?.enviado) {
        console.warn('[NotificacaoOperador] Falha ao enviar aviso de cadastro:', envio?.erro || 'motivo desconhecido');
        return { enviado: false, motivo: 'falha-envio', erro: envio?.erro || null };
      }
      return { enviado: true, messageId: envio.messageId || null };
    } catch (err) {
      console.error('[NotificacaoOperador] Erro inesperado ao avisar cadastro:', err.message);
      return { enviado: false, motivo: 'erro', erro: err.message };
    }
  }

  return { notificarCadastro };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const whatsappConfigService = require('./whatsappConfigService');
    const respostaWhatsapp = require('./respostaWhatsapp');
    _padrao = criarNotificador({
      getRawConfig: whatsappConfigService.getRawConfig,
      enviarWhatsapp: respostaWhatsapp.responder,
      householdIdDoOperador: process.env.NOTIFICACAO_CADASTRO_HOUSEHOLD_ID || null,
      destinoForcado: process.env.NOTIFICACAO_CADASTRO_DESTINO_JID || null,
    });
  }
  return _padrao;
}

module.exports = {
  criarNotificador,
  montarAvisoDeCadastro,
  destinoDe,
  notificarCadastro: (...args) => servico().notificarCadastro(...args),
};
