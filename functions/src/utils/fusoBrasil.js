/**
 * "Que dia é hoje?" respondido do ponto de vista do usuário, não do servidor.
 *
 * O Cloud Run roda em UTC. Brasília é UTC-3, então das 21h à meia-noite o
 * servidor já virou o dia enquanto o usuário ainda está no dia anterior. Toda
 * regra que fala em "hoje", "mês corrente" ou "amanhã" precisa desta função —
 * usar a data do servidor faz o sistema mentir por três horas, todo dia.
 *
 * Isto nasceu dentro de `importacao/janela.js`, onde a mesma armadilha apareceu
 * primeiro (o mês de importação abriria três horas cedo). Foi extraído para cá
 * quando o contador diário de IA precisou da mesma coisa: um serviço de limite
 * não deve depender do módulo de importação de extrato para saber que horas são.
 */

const FUSO = 'America/Sao_Paulo';

/** AAAA-MM-DD de "hoje" no Brasil, independente do fuso do servidor. */
function hojeNoBrasil(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

/**
 * Quando o próximo dia começa para o usuário — usado nas mensagens de limite
 * ("volto amanhã, 19/08, à meia-noite").
 *
 * Somar 24h sobre a data do SERVIDOR daria o dia errado entre 21h e meia-noite:
 * às 22h de Brasília o servidor já está no dia seguinte, e "mais um dia" viraria
 * dois dias à frente para quem está lendo a mensagem.
 *
 * @returns {{iso: string, data: string, hora: string}}
 */
function proximaMeiaNoiteBrasil(agora = new Date()) {
  const [ano, mes, dia] = hojeNoBrasil(agora).split('-').map(Number);

  // Date.UTC normaliza a virada de mês e de ano sozinho (31/12 + 1 = 01/01).
  const seguinte = new Date(Date.UTC(ano, mes - 1, dia + 1));

  const iso = seguinte.toISOString().slice(0, 10);
  const [a, m, d] = iso.split('-');

  return { iso, data: `${d}/${m}`, hora: 'meia-noite', ano: a };
}

module.exports = { FUSO, hojeNoBrasil, proximaMeiaNoiteBrasil };
