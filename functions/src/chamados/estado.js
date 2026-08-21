/**
 * Ciclo de vida do chamado de suporte — decisão pura, sem banco.
 *
 * Fica separado do service pelo mesmo motivo de `assinatura/estado.js`: a
 * pergunta "de quem é a vez agora?" é a regra de negócio inteira desta feature,
 * e ela precisa ser testável sem dublê de Firestore, sem transação e sem
 * requisição HTTP no caminho.
 *
 * A regra que dá sentido a tudo: **a fila mostra de quem é a vez sem ninguém
 * precisar julgar**. Operador respondeu, a bola é do cliente. Cliente
 * respondeu, a bola é do suporte. É isso que `aguardandoOperadorDesde` guarda —
 * e é por isso que ele existe separado de `ultimaMensagemEm`, que sobe dos dois
 * lados e portanto não serve para ordenar espera.
 */

const STATUS = {
  ABERTO: 'ABERTO',
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  AGUARDANDO_CLIENTE: 'AGUARDANDO_CLIENTE',
  RESOLVIDO: 'RESOLVIDO',
};

const CATEGORIAS = {
  DUVIDA: 'DUVIDA',
  PROBLEMA: 'PROBLEMA',
  COBRANCA: 'COBRANCA',
  SUGESTAO: 'SUGESTAO',
};

const AUTORES = { CLIENTE: 'CLIENTE', SUPORTE: 'SUPORTE' };

const MOTIVOS_RESOLUCAO = {
  OPERADOR: 'OPERADOR',
  INATIVIDADE_CLIENTE: 'INATIVIDADE_CLIENTE',
};

/** Quem resolveu, quando não foi uma pessoa. */
const RESOLVIDO_PELO_SISTEMA = 'SISTEMA';

const LIMITES = {
  // Teto de 1 MB por documento do Firestore, com as mensagens dentro dele.
  // 5.000 caracteres em UTF-8 ficam em ~5 KB; 200 mensagens no máximo dão
  // ~900 KB, e é por isso que o gatilho de migração é 200.
  CARACTERES_POR_MENSAGEM: 5000,
  ANEXOS_POR_MENSAGEM: 5,
  BYTES_POR_ANEXO: 5 * 1024 * 1024,
  // Antiabuso. Não existe rate limit por família em rota HTTP neste projeto
  // (o de rateLimit.js é por IP), então o teto é este — e ele é por família
  // por construção.
  CHAMADOS_ABERTOS_POR_FAMILIA: 5,
  ASSUNTO_MAXIMO: 120,
  // Vigilância barata do teto de 1 MB: a aba do operador avisa antes de
  // estourar, em vez de o sistema descobrir estourando.
  MENSAGENS_ATE_MIGRAR: 200,
};

/** Chamado em AGUARDANDO_CLIENTE por este tempo é encerrado sozinho. */
const DIAS_ATE_RESOLVER_POR_INATIVIDADE = 15;

/**
 * Resposta do cliente reabre o chamado resolvido — mas só dentro desta janela.
 *
 * Sem ela, um chamado de três meses atrás ressuscita no topo da fila porque
 * alguém respondeu "obrigado". Passada a janela, a resposta abre chamado NOVO
 * apontando para o antigo: o histórico não se perde e a fila não mente.
 */
const DIAS_PARA_REABRIR = 30;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

const ABERTOS = [STATUS.ABERTO, STATUS.EM_ANDAMENTO, STATUS.AGUARDANDO_CLIENTE];

function estaAberto(status) {
  return ABERTOS.includes(status);
}

/** Timestamp do Firestore, Date ou ISO — tudo vira milissegundos. */
function paraMs(valor) {
  if (!valor) return null;
  if (typeof valor.toMillis === 'function') return valor.toMillis();
  if (typeof valor.toDate === 'function') return valor.toDate().getTime();
  if (valor instanceof Date) return valor.getTime();
  const ms = new Date(valor).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Chamado resolvido ainda aceita resposta que o reabra?
 *
 * Resolvido sem `resolvidoEm` responde `true` de propósito: é dado incompleto,
 * e recusar a reabertura puniria o cliente por uma falha nossa de gravação.
 */
function podeReabrir(chamado, agora = new Date()) {
  if (chamado.status !== STATUS.RESOLVIDO) return true;

  const resolvidoEm = paraMs(chamado.resolvidoEm);
  if (resolvidoEm === null) return true;

  return (agora.getTime() - resolvidoEm) <= DIAS_PARA_REABRIR * UM_DIA_MS;
}

/**
 * O que muda no chamado quando alguém responde.
 *
 * Devolve `{ acao: 'CHAMADO_NOVO' }` quando a resposta do cliente chega depois
 * da janela de reabertura — aí não há patch nenhum a aplicar, e quem chama
 * precisa abrir outro chamado referenciando este.
 *
 * Nos demais casos devolve `{ acao: 'RESPONDER', campos }`, onde `campos` são
 * os do chamado que mudam. Timestamps entram como o valor recebido em `agora`;
 * quem grava troca por `serverTimestamp()` se quiser a hora do servidor.
 */
function decidirTransicao(chamado, autor, agora = new Date()) {
  if (!Object.values(AUTORES).includes(autor)) {
    throw Object.assign(new Error(`Autor inválido: ${autor}`), { statusCode: 400 });
  }

  const doCliente = autor === AUTORES.CLIENTE;

  if (doCliente && !podeReabrir(chamado, agora)) {
    return { acao: 'CHAMADO_NOVO', numeroAnterior: chamado.numero ?? null };
  }

  const novoStatus = doCliente ? STATUS.EM_ANDAMENTO : STATUS.AGUARDANDO_CLIENTE;

  const campos = {
    status: novoStatus,
    // Cliente respondeu, a espera pelo suporte começa agora. Operador
    // respondeu, a espera zera — a bola passou para o outro lado.
    aguardandoOperadorDesde: doCliente ? agora : null,
    ultimaMensagemEm: agora,
    ultimaMensagemPor: autor,
    // Quem escreve não acende o próprio indicador: acabou de ler o chamado
    // para responder.
    naoLidoPeloCliente: !doCliente,
    naoLidoPeloOperador: doCliente,
  };

  // `statusAlteradoEm` é o relógio da varredura de inatividade. Mexer nele
  // quando o status NÃO mudou adiaria o encerramento automático de graça.
  if (chamado.status !== novoStatus) campos.statusAlteradoEm = agora;

  // Responder em chamado resolvido o traz de volta à vida — inclusive quando
  // quem responde é o operador, acrescentando informação depois de fechar.
  if (chamado.status === STATUS.RESOLVIDO) {
    campos.resolvidoEm = null;
    campos.resolvidoPor = null;
    campos.motivoResolucao = null;
  }

  return { acao: 'RESPONDER', campos };
}

/** O que muda quando alguém (ou o sistema) marca o chamado como resolvido. */
function camposDeResolucao({ motivo, porQuem }, agora = new Date()) {
  if (!Object.values(MOTIVOS_RESOLUCAO).includes(motivo)) {
    throw Object.assign(new Error(`Motivo de resolução inválido: ${motivo}`), { statusCode: 400 });
  }

  return {
    status: STATUS.RESOLVIDO,
    statusAlteradoEm: agora,
    resolvidoEm: agora,
    resolvidoPor: porQuem,
    motivoResolucao: motivo,
    // Resolvido sai da fila de espera, seja qual for o motivo.
    aguardandoOperadorDesde: null,
    // O cliente precisa saber que foi resolvido; o operador acabou de agir.
    naoLidoPeloCliente: motivo === MOTIVOS_RESOLUCAO.OPERADOR,
    naoLidoPeloOperador: false,
  };
}

/**
 * Está parado em AGUARDANDO_CLIENTE há tempo demais?
 *
 * A conta é sobre `statusAlteradoEm`, e não sobre `ultimaMensagemEm`: o que
 * interessa é há quanto tempo a bola está com o cliente.
 */
function venceuPorInatividade(chamado, agora = new Date()) {
  if (chamado.status !== STATUS.AGUARDANDO_CLIENTE) return false;

  const desde = paraMs(chamado.statusAlteradoEm) ?? paraMs(chamado.ultimaMensagemEm);
  if (desde === null) return false;

  return (agora.getTime() - desde) >= DIAS_ATE_RESOLVER_POR_INATIVIDADE * UM_DIA_MS;
}

module.exports = {
  STATUS,
  CATEGORIAS,
  AUTORES,
  MOTIVOS_RESOLUCAO,
  RESOLVIDO_PELO_SISTEMA,
  LIMITES,
  ABERTOS,
  DIAS_ATE_RESOLVER_POR_INATIVIDADE,
  DIAS_PARA_REABRIR,
  estaAberto,
  podeReabrir,
  decidirTransicao,
  camposDeResolucao,
  venceuPorInatividade,
  paraMs,
};
