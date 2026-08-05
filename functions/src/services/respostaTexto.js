/**
 * Formatação das respostas do WhatsApp — funções puras, sem I/O.
 *
 * Separado de respostaWhatsapp.js de propósito: aqui não se importa Firestore
 * nem canal, então dá para testar sem dublê nenhum.
 *
 * ASSINATURA INVISÍVEL — o motivo de existir.
 *
 * O bot roda no mesmo número do usuário, então toda mensagem que ele envia
 * volta pelo webhook como se o usuário tivesse mandado. A confirmação
 * ("despesa de R$ 84,90 em Mercado") tem número e tem "R$": passa pelo filtro
 * de mensagem financeira e vira um lançamento novo, que gera outra confirmação,
 * e assim por diante — loop infinito enchendo o financeiro da família.
 *
 * Toda resposta sai carimbada com um caractere de largura zero. É invisível
 * para quem lê e inequívoco para o código.
 */

// Zero-width non-joiner (U+200C)
const ASSINATURA = '‌';

function assinar(texto) {
  return `${ASSINATURA}${texto}`;
}

function ehMensagemDoBot(texto) {
  return typeof texto === 'string' && texto.includes(ASSINATURA);
}

const RÓTULO_TIPO = { EXPENSE: 'despesa', INCOME: 'receita' };

function formatarValor(valor) {
  return Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Monta a confirmação a partir do modelo da família.
 * Variáveis aceitas: {tipo} {valor} {categoria} {descricao} {pagador}
 */
function montarConfirmacao(modelo, transacao) {
  const padrao = '✅ {tipo} de R$ {valor} em {categoria}';
  const texto = modelo || padrao;

  const base = texto
    .replace(/\{tipo\}/gi, RÓTULO_TIPO[transacao.type] || 'lançamento')
    .replace(/\{valor\}/gi, formatarValor(transacao.amount))
    .replace(/\{categoria\}/gi, transacao.category?.name || 'Outros')
    .replace(/\{descricao\}/gi, transacao.description || '')
    .replace(/\{pagador\}/gi, transacao.paidBy || '');

  // Compra parcelada: a pessoa precisa ver que lançamos as N parcelas, e não
  // só a primeira — senão parece que o sistema registrou o valor errado.
  const parcelas = transacao._parcelamento;
  if (parcelas > 1) {
    const total = transacao.valorTotalParcelamento;
    const totalFormatado = total ? ` (total R$ ${formatarValor(total)})` : '';
    return `${base}\n📅 ${parcelas}x lançadas, uma por mês${totalFormatado}`;
  }

  return base;
}

/**
 * Uma mensagem só para vários lançamentos: quem manda três gastos de uma vez
 * não quer três respostas seguidas no grupo.
 */
function montarConfirmacaoMultipla(modelo, transacoes) {
  if (transacoes.length === 1) return montarConfirmacao(modelo, transacoes[0]);

  return [
    `✅ ${transacoes.length} lançamentos registrados:`,
    ...transacoes.map((t) => `• ${montarConfirmacao(modelo, t).replace(/^✅\s*/, '')}`),
  ].join('\n');
}

module.exports = {
  ASSINATURA,
  assinar,
  ehMensagemDoBot,
  montarConfirmacao,
  montarConfirmacaoMultipla,
  formatarValor,
};
