/**
 * Rate limit por família, independente do limite global do webhook.
 *
 * `middlewares/rateLimit.js` protege a rota inteira (120 req/min, somadas
 * todas as famílias) — mas nada impedia um grupo sozinho de consumir essa
 * fatia inteira por um minuto, atrasando o processamento de todo mundo. Este
 * módulo limita quantas mensagens UMA família processa por minuto,
 * independente do tráfego das outras.
 *
 * Em memória, de propósito — janela por minuto não precisa sobreviver a
 * reinício nem ser exata entre instâncias (mesma observação honesta já feita
 * em rateLimit.js: com várias instâncias do Cloud Run ativas, o teto efetivo
 * fica um pouco mais alto que o configurado). Checar no Firestore a cada
 * mensagem, inclusive as que o parser por regra resolve de graça, pagaria
 * uma leitura/escrita extra por mensagem só para throttling.
 */

const JANELA_MS = 60 * 1000;
const LIMITE_PADRAO = 40; // mensagens processadas por minuto, por família

function criarLimiteMensagensService() {
  const janelas = new Map(); // householdId -> { inicio, contagem }
  const limite = Number(process.env.LIMITE_MENSAGENS_POR_MINUTO) || LIMITE_PADRAO;

  /** true se a mensagem pode ser processada agora; já consome a cota. */
  function permitirMensagem(householdId) {
    const agora = Date.now();
    const atual = janelas.get(householdId);

    if (!atual || agora - atual.inicio >= JANELA_MS) {
      janelas.set(householdId, { inicio: agora, contagem: 1 });
      return true;
    }

    if (atual.contagem >= limite) return false;

    atual.contagem += 1;
    return true;
  }

  return { permitirMensagem, limite };
}

// Instância única do processo — o mapa precisa ser compartilhado entre todas
// as chamadas, não recriado a cada mensagem.
const _padrao = criarLimiteMensagensService();

module.exports = {
  criarLimiteMensagensService,
  permitirMensagem: _padrao.permitirMensagem,
  limite: _padrao.limite,
};
