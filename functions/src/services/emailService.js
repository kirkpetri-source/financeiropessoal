/**
 * Envio de e-mail, pelo Resend.
 *
 * Primeiro e único caminho de e-mail do projeto — até 21/08/2026 todo aviso
 * saía por WhatsApp. Por isso o serviço nasce com a mesma regra que o
 * `notificacaoOperadorService` já seguia: **nunca lança**. O chamado do cliente
 * é o que importa; o aviso é conveniência, e provedor de e-mail fora do ar não
 * pode derrubar a criação de um chamado de suporte.
 *
 * Sem SDK: o Resend expõe um POST JSON e a function já tem `fetch` nativo.
 * Trazer o pacote `resend` custaria uma dependência a mais no container para
 * economizar dez linhas.
 *
 * Desligado por padrão. Sem `RESEND_API_KEY` ou sem `SUPORTE_EMAIL_REMETENTE`,
 * `enviar` responde `{ enviado: false, motivo: 'desligado' }` sem tocar na rede
 * — é o que mantém teste, conta descartável e qualquer ambiente sem e-mail
 * configurado funcionando igual.
 */

const API = 'https://api.resend.com/emails';

function criarEmailService({ chave, remetente, nomeDoRemetente = 'RevelaCash', http = fetch }) {
  const ligado = !!chave && !!remetente;

  /**
   * Manda um e-mail. `texto` sempre; `html` quando houver.
   *
   * Os DOIS juntos, e não só o HTML: cliente de e-mail antigo e leitor de tela
   * usam a versão em texto, e mensagem só-HTML pontua pior nos filtros de spam.
   * O Resend monta o multipart sozinho quando recebe os dois.
   */
  async function enviar({ para, assunto, texto, html }) {
    if (!ligado) return { enviado: false, motivo: 'desligado' };
    if (!para) return { enviado: false, motivo: 'sem-destinatario' };

    try {
      const resposta = await http(API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${chave}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${nomeDoRemetente} <${remetente}>`,
          to: [para],
          subject: assunto,
          text: texto,
          ...(html ? { html } : {}),
        }),
      });

      if (!resposta.ok) {
        // O corpo do erro é lido de propósito: "429" sozinho já custou tempo
        // neste projeto quando era modelo descontinuado disfarçado de cota.
        // Aqui, 403 pode ser domínio não verificado e 422 remetente errado —
        // diagnósticos completamente diferentes com a mesma cara.
        const corpo = await resposta.text().catch(() => '');
        const erro = `${resposta.status} ${corpo.slice(0, 200)}`.trim();

        console.warn('[Email] Falha ao enviar:', erro);
        return { enviado: false, motivo: 'falha-envio', erro };
      }

      const { id } = await resposta.json().catch(() => ({}));
      return { enviado: true, id: id || null };
    } catch (err) {
      // Rede fora, DNS, timeout. Nunca escapa.
      console.error('[Email] Erro inesperado:', err.message);
      return { enviado: false, motivo: 'erro', erro: err.message };
    }
  }

  return { enviar, ligado };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    _padrao = criarEmailService({
      chave: process.env.RESEND_API_KEY,
      remetente: process.env.SUPORTE_EMAIL_REMETENTE,
    });
  }
  return _padrao;
}

module.exports = {
  criarEmailService,
  enviar: (...args) => servico().enviar(...args),
};
