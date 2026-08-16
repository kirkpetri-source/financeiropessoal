/**
 * Janela do que pode ser importado: **só mês já fechado**.
 *
 * Decisão do Kirk, e a mais importante da importação inteira. O mês corrente é
 * exatamente onde os lançamentos por WhatsApp estão acontecendo agora — é ali
 * que uma linha de extrato tem chance real de descrever o mesmo gasto que a
 * pessoa já lançou pelo celular. Deixar o mês em curso de fora elimina a
 * sobreposição na origem, em vez de tentar detectá-la depois.
 *
 * O corte é por MÊS, não por data: dia 1º de setembro libera agosto inteiro,
 * e não "os últimos 30 dias". É assim que a pessoa pensa quando baixa extrato
 * ("o extrato de agosto"), e é o recorte que o banco exporta.
 *
 * Fuso fixo em America/Sao_Paulo, e não o do servidor: o Cloud Run roda em UTC,
 * então nas três primeiras horas de cada dia 1º o servidor ainda acha que é o
 * mês anterior. Sem fixar o fuso, a importação de agosto abriria três horas
 * cedo — pior, abriria enquanto agosto ainda está correndo para o usuário.
 */

const FUSO = 'America/Sao_Paulo';

const MOTIVO = {
  MES_CORRENTE: 'MES_CORRENTE',
  FUTURA: 'FUTURA',
};

/** AAAA-MM-DD de "hoje" no fuso do Brasil, independente do fuso do servidor. */
function hojeNoBrasil(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

/** AAAA-MM do mês em curso no Brasil — o mês que NÃO pode ser importado. */
function mesCorrente(agora = new Date()) {
  return hojeNoBrasil(agora).slice(0, 7);
}

/** O mês mais recente que já fechou. É até aqui que a importação alcança. */
function ultimoMesFechado(agora = new Date()) {
  const [ano, mes] = mesCorrente(agora).split('-').map(Number);
  const anterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  return `${anterior.ano}-${String(anterior.mes).padStart(2, '0')}`;
}

/**
 * Uma data cabe na janela?
 *
 * @returns {null|string} null quando pode entrar; o motivo da recusa quando não.
 */
function motivoDeRecusa(dataISO, agora = new Date()) {
  const mes = String(dataISO || '').slice(0, 7);
  const corrente = mesCorrente(agora);

  if (mes > corrente) return MOTIVO.FUTURA;
  if (mes === corrente) return MOTIVO.MES_CORRENTE;
  return null;
}

/**
 * Separa o que pode entrar do que não pode.
 *
 * Recusar não é o mesmo que falhar: o extrato que a pessoa baixa quase sempre
 * pega "de 1º de julho até hoje", então recusar as linhas do mês corrente e
 * importar o resto é o caminho NORMAL, não o excepcional. Por isso a função
 * devolve as duas listas em vez de lançar erro — quem chama decide como contar
 * a história na tela.
 */
function filtrarRetroativas(transacoes, { agora = new Date() } = {}) {
  const aceitas = [];
  const recusadas = [];

  for (const t of transacoes || []) {
    const motivo = motivoDeRecusa(t.data, agora);
    if (motivo) recusadas.push({ ...t, motivoRecusa: motivo });
    else aceitas.push(t);
  }

  return { aceitas, recusadas };
}

/**
 * Explicação curta para a tela. Fica aqui junto da regra: mensagem que mora
 * longe da condição que a gerou envelhece sem ninguém perceber.
 */
function explicarRecusa(motivo, agora = new Date()) {
  if (motivo === MOTIVO.FUTURA) {
    return 'Lançamento com data no futuro — confira o arquivo, o banco não exporta isso normalmente.';
  }
  if (motivo === MOTIVO.MES_CORRENTE) {
    return `A importação aceita só mês já fechado (até ${ultimoMesFechado(agora)}). `
      + 'O mês em andamento fica de fora porque é onde seus lançamentos pelo WhatsApp estão entrando — '
      + 'importar agora criaria lançamento repetido.';
  }
  return null;
}

module.exports = {
  FUSO,
  MOTIVO,
  hojeNoBrasil,
  mesCorrente,
  ultimoMesFechado,
  motivoDeRecusa,
  filtrarRetroativas,
  explicarRecusa,
};
