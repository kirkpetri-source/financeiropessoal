/**
 * Avisa o operador quando uma rotina automática falha.
 *
 * O sistema tem cinco funções agendadas (exclusões LGPD, chamados inativos,
 * contas recorrentes, faturas, backup) e nenhuma delas tinha como avisar
 * ninguém: um erro virava uma linha de `console.error` que só aparece para
 * quem for olhar o log da Cloud Function. Uma varredura de LGPD quebrada por
 * uma semana é um problema legal; um backup que parou de rodar só se descobre
 * no dia em que ele fizer falta.
 *
 * O destino é a MESMA coleção que a aba Chamados já mostra no topo
 * (`notificacoesNaoEntregues`) — a tela de "coisas que precisam de atenção já
 * existe", e criar um segundo lugar para olhar é como não avisar. O operador
 * dá baixa pelo mesmo botão.
 *
 * Nada aqui lança: um alerta que derruba a rotina que ele deveria vigiar seria
 * pior que o problema original.
 */

const COLECAO = 'notificacoesNaoEntregues';

/** Id previsível: uma rotina que falha todo dia gera UM aviso, não trinta. */
function idDoAlerta(rotina, agora) {
  const dia = agora.toISOString().slice(0, 10);
  return `rotina__${rotina}__${dia}`;
}

function criarAlertaOperacional({ db, agora = () => new Date() }) {
  /**
   * Registra que uma rotina falhou.
   *
   * Usa `set` com merge e id do dia: a mesma rotina falhando várias vezes no
   * mesmo dia atualiza o registro e conta as ocorrências, em vez de encher a
   * tela do operador com o mesmo aviso repetido.
   */
  async function rotinaFalhou(rotina, erro) {
    try {
      const quando = agora();
      const ref = db.collection(COLECAO).doc(idDoAlerta(rotina, quando));
      const existente = await ref.get();

      await ref.set({
        tipo: 'ROTINA_FALHOU',
        canal: 'SISTEMA',
        rotina,
        destinatario: 'operação',
        // `new Error()` tem `message` vazio, e um `||` ingênuo cairia no
        // próprio objeto — o aviso viraria a palavra "Error", que não ajuda
        // ninguém a entender o que quebrou.
        erro: (String(erro?.message ?? erro ?? '').trim() || 'erro sem mensagem').slice(0, 500),
        ocorrencias: (existente.exists ? existente.data().ocorrencias || 1 : 0) + 1,
        resolvida: false,
        criadoEm: existente.exists ? existente.data().criadoEm : quando.toISOString(),
        ultimaEm: quando.toISOString(),
      }, { merge: true });
    } catch (err) {
      // Falhar aqui não pode derrubar a rotina. O log continua de pé.
      console.error(`[Alerta] Não consegui registrar a falha de ${rotina}:`, err.message);
    }
  }

  /**
   * Roda uma rotina agendada e avisa se ela quebrar.
   *
   * Envolver cada agendada nisto é o que transforma "erro no log" em "aviso na
   * tela". Devolve o resultado da rotina, ou `null` quando falhou — quem chama
   * decide se continua.
   */
  async function vigiar(rotina, executar) {
    try {
      const resultado = await executar();
      console.log(`[${rotina}] Concluído:`, JSON.stringify(resultado ?? {}));
      return resultado;
    } catch (err) {
      console.error(`[${rotina}] Falhou:`, err.message);
      await rotinaFalhou(rotina, err);
      return null;
    }
  }

  return { rotinaFalhou, vigiar };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { db } = require('../config/firebaseAdmin');
    _padrao = criarAlertaOperacional({ db });
  }
  return _padrao;
}

module.exports = {
  criarAlertaOperacional,
  idDoAlerta,
  COLECAO,
  rotinaFalhou: (...a) => servico().rotinaFalhou(...a),
  vigiar: (...a) => servico().vigiar(...a),
};
