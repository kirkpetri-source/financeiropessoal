const { proximaMeiaNoiteBrasil } = require('./fusoBrasil');

/**
 * As duas recusas que o cliente lê quando um teto diário acaba.
 *
 * Módulo-folha (só depende de `fusoBrasil`, que também é folha) para poder ser
 * testado sem arrastar o Firestore — `lancamentoPorMensagem.js` importa
 * `firebaseAdmin` no topo, e sob teste isso dispara a trava anti-produção
 * (regra 2). Mesmo motivo de `utils/subcategoriaConfirmacao.js` existir.
 *
 * As duas seguem o mesmo princípio, e ele não é "avisar que acabou":
 *
 *   dizer o que aconteceu · deixar claro que NADA se perdeu ·
 *   mostrar o caminho que continua aberto · informar quando volta
 *
 * O terceiro item é o que mais importa. O parser por regra não gasta IA
 * nenhuma e não tem limite, então ninguém fica de fato impedido de registrar
 * um gasto — no pior caso precisa escrever no formato que o sistema entende
 * sozinho. Uma mensagem que só reclama esconderia isso.
 */

/** Teto de LANÇAMENTOS por IA (linguagem livre, áudio, foto de cupom). */
function mensagemLimiteIA(agora = new Date()) {
  const { data, hora } = proximaMeiaNoiteBrasil(agora);

  return [
    'Cheguei no limite de lançamentos automáticos por IA de hoje.',
    '',
    'O que isso quer dizer: até amanhã eu não consigo interpretar mensagens',
    'escritas em linguagem livre, áudio ou foto de cupom. Nada foi perdido —',
    'todos os seus lançamentos continuam salvos.',
    '',
    'Você pode registrar agora mesmo, sem depender da IA. Comece dizendo se',
    'gastou ou recebeu:',
    '',
    '• gastei 84,90 no mercado',
    '• paguei 50 de gasolina no pix',
    '• recebi 2500 de salário',
    '',
    'Esse formato funciona sempre, sem limite nenhum.',
    '',
    `O limite renova amanhã, ${data}, à ${hora} (horário de Brasília).`,
  ].join('\n');
}

/** Teto de CONVERSA com a assistente. */
function mensagemLimiteChat(agora = new Date()) {
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

module.exports = { mensagemLimiteIA, mensagemLimiteChat };
