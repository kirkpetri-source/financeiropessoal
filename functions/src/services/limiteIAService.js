const { format } = require('date-fns');

/**
 * Teto diário de chamadas de IA (Gemini) por família.
 *
 * Sem isso, um número comprometido ou uma automação mandando mensagem atrás
 * de mensagem gerava chamada de IA sem limite nenhum — custeada pelo projeto
 * inteiro, já que a assinatura é fixa (R$24,90/mês) e não por uso. Como a
 * chave da Gemini é uma só para todas as famílias, uma família sozinha
 * estourando a cota também podia derrubar a IA de todo mundo (mesmo sintoma
 * do 429 já visto antes por outro motivo — modelo descontinuado).
 *
 * O contador vive no próprio doc de `whatsappConfigs/{householdId}` — já é
 * um documento por família, gerenciado pelo sistema, fora do alcance do
 * formulário do cliente (ver PROTEGIDOS em whatsappConfigService.js).
 *
 * `db`/`admin` entram por parâmetro (fábrica), mesmo motivo dos outros
 * serviços: um require direto de `config/firebaseAdmin` arrastaria o
 * Firestore de produção para dentro do teste.
 */

const LIMITE_PADRAO = 60;

function criarLimiteIAService({ db, admin }) {
  const limite = Number(process.env.LIMITE_DIARIO_IA) || LIMITE_PADRAO;

  /**
   * Confere e já consome uma chamada do teto diário, na mesma transação —
   * duas mensagens quase simultâneas não podem ler a mesma contagem e as
   * duas passarem. Devolve false quando o teto de hoje já foi atingido.
   */
  async function verificarLimiteDeIA(householdId) {
    const hoje = format(new Date(), 'yyyy-MM-dd');
    const ref = db.collection('whatsappConfigs').doc(householdId);

    return db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const dados = doc.exists ? doc.data() : {};
      const contagemDeHoje = dados.iaContagemData === hoje ? (dados.iaContagemDiaria || 0) : 0;

      if (contagemDeHoje >= limite) return false;

      tx.set(ref, {
        iaContagemDiaria: contagemDeHoje + 1,
        iaContagemData: hoje,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return true;
    });
  }

  return { verificarLimiteDeIA, limite };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { admin, db } = require('../config/firebaseAdmin');
    _padrao = criarLimiteIAService({ db, admin });
  }
  return _padrao;
}

module.exports = {
  criarLimiteIAService,
  LIMITE_PADRAO,
  verificarLimiteDeIA: (...args) => servico().verificarLimiteDeIA(...args),
};
