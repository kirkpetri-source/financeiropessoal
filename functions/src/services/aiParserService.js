/**
 * Placeholder para futura integração com IA (ex: Gemini Flash/Flash-Lite).
 * Será acionado quando o parser de texto simples não conseguir interpretar a mensagem.
 * Por enquanto retorna null para que o sistema marque o log como pendente.
 */
async function parseWithAI(messageContent) {
  // TODO: integrar com Gemini Flash ou outro modelo de linguagem
  // Exemplo de retorno esperado:
  // {
  //   type: 'EXPENSE' | 'INCOME',
  //   description: string,
  //   amount: number,
  //   categoryName: string,
  //   paymentMethodName: string,
  //   date: Date,
  // }

  console.log('[AI Parser] Chamada recebida, porém IA ainda não implementada. Mensagem:', messageContent);
  return null;
}

module.exports = { parseWithAI };
