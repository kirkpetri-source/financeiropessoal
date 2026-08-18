const { hojeNoBrasil, proximaMeiaNoiteBrasil } = require('../utils/fusoBrasil');

/**
 * Teto diário de conversas com o consultor de IA, por família.
 *
 * SEPARADO do teto de lançamento (`limiteIAService`), e isso não é detalhe:
 * lançar é a função principal do produto. Se conversar consumisse o mesmo
 * contador, uma tarde de perguntas deixaria a família sem conseguir registrar
 * um gasto — o pior resultado possível para quem paga a assinatura.
 *
 * O contador vive no mesmo documento do outro (`whatsappConfigs/{householdId}`)
 * em campos próprios, pelo mesmo motivo já registrado lá: é um documento por
 * família, gerenciado pelo sistema, fora do alcance de qualquer formulário do
 * cliente. Coleção nova só para dois números seria peso sem ganho.
 *
 * O dia é o do BRASIL. O Cloud Run roda em UTC, e um contador que zera às 21h
 * faria a mensagem "volto à meia-noite" mentir para o cliente.
 */

const LIMITE_PADRAO = 20;

function criarLimiteChatService({ db, admin }) {
  const limite = Number(process.env.LIMITE_DIARIO_CHAT) || LIMITE_PADRAO;

  function refDe(householdId) {
    return db.collection('whatsappConfigs').doc(householdId);
  }

  function lerContagem(dados, hoje) {
    return dados?.chatContagemData === hoje ? (dados.chatContagemDiaria || 0) : 0;
  }

  /**
   * Quanto já foi usado hoje, SEM consumir. É o que alimenta a porcentagem no
   * painel — mostrar o uso não pode custar uma pergunta.
   */
  async function consultarUso(householdId, agora = new Date()) {
    const hoje = hojeNoBrasil(agora);
    const doc = await refDe(householdId).get();
    const usadas = lerContagem(doc.exists ? doc.data() : {}, hoje);

    return {
      usadas,
      limite,
      restantes: Math.max(0, limite - usadas),
      // Porcentagem, e não "8 de 20", por decisão de produto: porcentagem
      // informa folga; contagem regressiva transforma conversa em racionamento.
      percentual: limite > 0 ? Math.min(100, Math.round((usadas / limite) * 100)) : 0,
      esgotado: usadas >= limite,
    };
  }

  /**
   * Confere e consome na mesma transação — duas perguntas quase simultâneas não
   * podem ler a mesma contagem e passar as duas.
   */
  async function consumir(householdId, agora = new Date()) {
    const hoje = hojeNoBrasil(agora);
    const ref = refDe(householdId);

    return db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const usadas = lerContagem(doc.exists ? doc.data() : {}, hoje);

      if (usadas >= limite) {
        return { permitido: false, usadas, limite, restantes: 0, percentual: 100 };
      }

      tx.set(ref, {
        chatContagemDiaria: usadas + 1,
        chatContagemData: hoje,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      const novas = usadas + 1;
      return {
        permitido: true,
        usadas: novas,
        limite,
        restantes: limite - novas,
        percentual: Math.min(100, Math.round((novas / limite) * 100)),
      };
    });
  }

  /**
   * A recusa que o cliente lê quando a cota acaba.
   *
   * Diz o que aconteceu, quando volta (data e hora, no fuso dele) e — o que
   * mais importa — **o que continua funcionando**. Ninguém pode sair desta
   * mensagem sem saber como registrar um gasto: o parser por regra não gasta
   * IA nenhuma e não tem limite, então o caminho nunca está fechado de verdade.
   */
  function mensagemDeLimite(agora = new Date()) {
    const { data, hora } = proximaMeiaNoiteBrasil(agora);

    return [
      'Chegamos no limite de conversa de hoje.',
      '',
      `Volto a responder amanhã, ${data}, a partir da ${hora}`,
      '(horário de Brasília).',
      '',
      'Enquanto isso, continua tudo funcionando normalmente:',
      '',
      '• Registrar gasto: gastei 84,90 no mercado',
      '• Totais do mês: resumo',
      '• Últimos lançamentos: ultimos',
      '• Gastos por categoria: categorias',
      '',
      'Esses comandos não passam por IA e não têm limite.',
    ].join('\n');
  }

  return { consultarUso, consumir, mensagemDeLimite, limite };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { admin, db } = require('../config/firebaseAdmin');
    _padrao = criarLimiteChatService({ db, admin });
  }
  return _padrao;
}

module.exports = {
  criarLimiteChatService,
  LIMITE_PADRAO,
  consultarUso: (...args) => servico().consultarUso(...args),
  consumir: (...args) => servico().consumir(...args),
  mensagemDeLimite: (...args) => servico().mensagemDeLimite(...args),
};
