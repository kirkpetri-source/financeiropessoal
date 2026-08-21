/**
 * Criação do log de uma mensagem recebida — uma vez só, por construção.
 *
 * O log do WhatsApp é a marca de "esta mensagem já foi tratada": é ele que
 * impede o webhook e o polling de lançarem o mesmo gasto duas vezes. Só que a
 * conferência antiga era em dois tempos:
 *
 *     if (await jaProcessada(messageId)) return;   // pergunta
 *     await createLog(dados, { ... });             // grava
 *
 * Entre a pergunta e a gravação existe uma janela. Duas entregas simultâneas da
 * MESMA mensagem — reenvio do Evolution, ou o polling caindo em cima do webhook
 * — passam as duas pela pergunta, gravam dois logs e criam dois lançamentos. É
 * o mesmo raciocínio da importação de extrato (regra 15 do projeto): quem fecha
 * a janela é o Firestore, não a aplicação.
 *
 * Aqui o ID do documento é derivado do messageId, e `criarComId` usa `create()`
 * — que o Firestore recusa quando o ID já existe. A segunda entrega recebe
 * `criado: false` e para, sem ter escrito nada.
 *
 * `jaProcessada()` continua valendo a pena ANTES disto: ela evita baixar mídia
 * e chamar a IA para uma mensagem que já foi tratada. O que ela não faz é
 * garantir — garantir é papel desta função.
 *
 * Módulo sem `firebaseAdmin` no topo de propósito: recebe o escopo pronto por
 * parâmetro e por isso tem teste de unidade de verdade (a trava da regra 2
 * derruba a suíte inteira quando alguém importa o Admin SDK sob VITEST — é
 * exatamente por isso que o webhook não tem teste em vitest).
 */

// ID de documento do Firestore não pode conter "/" nem casar com "__algo__".
// O prefixo do householdId resolve o segundo caso sozinho, e ainda mantém as
// famílias sem qualquer chance de colisão: o messageId vem de fora, do payload
// do WhatsApp, e nada que venha de fora deve poder alcançar o documento de
// outra família.
const MAX_MESSAGE_ID = 200;

function idDoLog(householdId, messageId) {
  const bruto = String(messageId || '').trim();
  if (!householdId || !bruto) return null;

  const limpo = bruto.replace(/\//g, '_').slice(0, MAX_MESSAGE_ID);
  return `${householdId}__${limpo}`;
}

/**
 * Grava o log da mensagem, ou avisa que outra execução chegou primeiro.
 *
 * @returns {{log: object|null, criado: boolean}} `criado: false` significa que
 *   a mensagem já está sendo tratada por outra execução — quem chamou deve
 *   parar ali, sem responder nada: quem ganhou a corrida é que responde.
 */
async function criarLogUnico(dados, entrada) {
  const id = idDoLog(dados.householdId, entrada.messageId);

  // Sem messageId não há o que deduplicar. Não acontece pelo webhook nem pelo
  // polling (os dois só chegam aqui com a chave da mensagem em mãos), mas cair
  // para o caminho normal é melhor que perder o registro da mensagem.
  if (!id) {
    const log = await dados.criar('whatsappLogs', entrada);
    return { log, criado: true };
  }

  const resultado = await dados.criarComId('whatsappLogs', id, entrada);
  if (!resultado.criado) return { log: null, criado: false, motivo: 'JA_PROCESSADA' };

  return { log: { id, ...entrada }, criado: true };
}

module.exports = { idDoLog, criarLogUnico };
