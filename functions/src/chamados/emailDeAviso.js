/**
 * O visual dos e-mails de suporte.
 *
 * Três coisas mandam no desenho, e nenhuma é estética:
 *
 * 1. **Cliente de e-mail não é navegador.** Nada de flexbox, grid ou CSS em
 *    folha separada: o Outlook desenha com um motor de Word e ignora quase
 *    tudo. Tabela e estilo inline são o que funciona em todos.
 *
 * 2. **Imagem é bloqueada por padrão em muita gente.** Por isso a marca não
 *    depende do logo: o nome "RevelaCash" é TEXTO, na cor da marca. Com as
 *    imagens desligadas o e-mail continua reconhecível, em vez de virar um
 *    retângulo vazio com um "x".
 *
 * 3. **O aviso não carrega conteúdo do chamado** — nem o texto, nem o assunto.
 *    E o rodapé DIZ isso, em vez de deixar a pessoa achar que o e-mail veio
 *    truncado. A limitação é uma decisão de privacidade; explicá-la a
 *    transforma em motivo de confiança.
 *
 * O texto puro continua indo junto (multipart). Não é enfeite: cliente de
 * e-mail antigo e leitor de tela usam ele, e mensagem só-HTML pontua pior nos
 * filtros de spam.
 */

// Tokens da identidade, os mesmos do painel.
const ROXO = '#512b8d';
const ROXO_ESCURO = '#3f216e';
const TINTA = '#1c1916';
const APAGADO = '#6e6a63';
const BORDA = '#ebe8e2';
const FUNDO = '#f7f5f2';

/**
 * O logo aponta para o domínio público, e NÃO para `APP_URL`.
 *
 * `APP_URL` em homologação é `localhost:5173` — um e-mail é lido fora do
 * navegador que rodou o teste, então a imagem simplesmente não carregaria.
 * O arquivo é PNG de propósito: os outros do projeto são WebP, que o Outlook
 * não abre.
 */
const LOGO = 'https://www.revelacash.com.br/brand/icon-square-dark-180.png';

/** `&`, `<` e `>` viram entidade. Nada aqui vem do cliente, mas o número vem da rota. */
function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Monta o e-mail inteiro.
 *
 * @param {object} p
 * @param {number|string} p.numero    número do chamado
 * @param {string} p.titulo           a frase principal
 * @param {string} p.explicacao       uma linha de contexto
 * @param {string} p.link             para onde o botão leva
 * @param {string} p.rotuloDoBotao    o texto do botão
 * @param {boolean} p.paraOperador    muda só o rodapé
 */
function montarHtml({ numero, titulo, explicacao, link, rotuloDoBotao, paraOperador }) {
  const rodape = paraOperador
    ? 'Você recebeu este aviso porque cuida do suporte do RevelaCash.'
    : 'Você recebeu este aviso porque tem um chamado aberto no RevelaCash.';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chamado #${escapar(numero)}</title>
</head>
<body style="margin:0;padding:0;background:${FUNDO};">
  <!-- Prévia da caixa de entrada. Escondida no corpo, mas é a segunda linha que
       a pessoa lê na lista de e-mails — sem ela, o cliente mostra o começo do
       HTML. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${escapar(explicacao)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FUNDO};">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BORDA};border-radius:12px;overflow:hidden;">

          <tr><td style="height:4px;background:${ROXO};font-size:0;line-height:0;">&nbsp;</td></tr>

          <tr>
            <td style="padding:20px 24px 0 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:10px;">
                    <img src="${LOGO}" width="32" height="32" alt=""
                         style="display:block;border:0;border-radius:8px;">
                  </td>
                  <td style="font-family:Helvetica,Arial,sans-serif;font-size:17px;font-weight:bold;color:${ROXO};">
                    RevelaCash
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 24px 8px 24px;font-family:Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 6px 0;font-size:12px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:${APAGADO};">
                Chamado #${escapar(numero)}
              </p>
              <h1 style="margin:0;font-size:21px;line-height:1.3;color:${TINTA};font-weight:bold;">
                ${escapar(titulo)}
              </h1>
              <p style="margin:10px 0 0 0;font-size:15px;line-height:1.55;color:${APAGADO};">
                ${escapar(explicacao)}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 24px 4px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:${ROXO};border-radius:8px;">
                    <a href="${escapar(link)}"
                       style="display:inline-block;padding:12px 22px;font-family:Helvetica,Arial,sans-serif;
                              font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">
                      ${escapar(rotuloDoBotao)}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- O link em texto existe para quem o botão não funciona: cliente que
               desmonta o HTML, ou quem prefere copiar e colar. -->
          <tr>
            <td style="padding:14px 24px 22px 24px;font-family:Helvetica,Arial,sans-serif;
                       font-size:12px;line-height:1.5;color:${APAGADO};word-break:break-all;">
              Se o botão não abrir, copie este endereço:<br>
              <a href="${escapar(link)}" style="color:${ROXO_ESCURO};">${escapar(link)}</a>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 24px 22px 24px;border-top:1px solid ${BORDA};
                       font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${APAGADO};">
              ${escapar(rodape)}<br>
              <strong style="color:${TINTA};">Este aviso não traz o conteúdo da conversa</strong> —
              ela fica guardada no sistema, e é lá que se lê e responde.
            </td>
          </tr>
        </table>

        <p style="margin:16px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${APAGADO};">
          RevelaCash · o financeiro da família, revelado
        </p>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** A versão em texto puro. Mesmo conteúdo, mesma ausência de conteúdo do chamado. */
function montarTexto({ numero, titulo, explicacao, link }) {
  return [
    `Chamado #${numero}`,
    '',
    titulo,
    explicacao,
    '',
    link,
    '',
    '--',
    'Este aviso não traz o conteúdo da conversa — ela fica guardada no sistema.',
    'RevelaCash',
  ].join('\n');
}

/** Devolve `{ assunto, html, texto }` prontos para o emailService. */
function montarAviso({ assunto, ...partes }) {
  return {
    assunto,
    html: montarHtml(partes),
    texto: montarTexto(partes),
  };
}

module.exports = { montarAviso, montarHtml, montarTexto, escapar, LOGO };
