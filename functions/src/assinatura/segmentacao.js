const { situacaoDaAssinatura, MOTIVOS, STATUS } = require('./estado');
const { PLANO_INTERNO } = require('./metricas');

/**
 * Segmentos de família usados pelo CRM do operador (filtro da lista e público
 * de um broadcast). Função pura — mesma situação já calculada em
 * `GET /plataforma/familias`, só reaproveitada aqui para não duplicar a regra
 * de quem está em trial, atrasado, em carência etc.
 */

const SEGMENTOS = [
  { chave: 'todas', rotulo: 'Todas as famílias' },
  { chave: 'trial', rotulo: 'Em trial' },
  { chave: 'trial_vencido', rotulo: 'Trial vencido' },
  { chave: 'pagantes', rotulo: 'Pagantes' },
  { chave: 'carencia', rotulo: 'Em carência' },
  { chave: 'atrasadas', rotulo: 'Pagamento atrasado' },
  { chave: 'cortesias', rotulo: 'Cortesias (internas)' },
  { chave: 'canceladas', rotulo: 'Canceladas' },
  { chave: 'precisam_contato', rotulo: 'Precisam de contato (atraso + carência + trial vencido)' },
];

const CHAVES_VALIDAS = new Set(SEGMENTOS.map((s) => s.chave));

function pertenceAoSegmento(familia, situacao, segmento) {
  const assinatura = familia.subscription || {};
  const interna = assinatura.plan === PLANO_INTERNO;

  switch (segmento) {
    case 'todas': return true;
    case 'trial': return situacao.motivo === MOTIVOS.TRIAL;
    case 'trial_vencido': return situacao.motivo === MOTIVOS.TRIAL_VENCIDO;
    case 'pagantes': return assinatura.status === STATUS.ATIVA && !interna;
    case 'carencia': return situacao.emCarencia;
    case 'atrasadas': return assinatura.status === STATUS.ATRASADA;
    case 'cortesias': return interna;
    case 'canceladas': return assinatura.status === STATUS.CANCELADA;
    case 'precisam_contato':
      return assinatura.status === STATUS.ATRASADA || situacao.emCarencia || situacao.motivo === MOTIVOS.TRIAL_VENCIDO;
    default: return false;
  }
}

/** Filtra a lista de famílias (`{id, subscription, ...}`) pelo segmento pedido. */
function filtrarPorSegmento(familias, segmento, agora = new Date()) {
  if (!CHAVES_VALIDAS.has(segmento)) {
    throw Object.assign(new Error(`Segmento "${segmento}" não existe.`), { statusCode: 400 });
  }
  return familias.filter((f) => pertenceAoSegmento(f, situacaoDaAssinatura(f.subscription, agora), segmento));
}

/** Conta quantas famílias caem em cada segmento — usado pra UI mostrar "23 famílias" antes de enviar. */
function contarSegmentos(familias, agora = new Date()) {
  const situacoes = familias.map((f) => situacaoDaAssinatura(f.subscription, agora));
  return SEGMENTOS.map(({ chave, rotulo }) => ({
    chave,
    rotulo,
    total: familias.filter((f, i) => pertenceAoSegmento(f, situacoes[i], chave)).length,
  }));
}

module.exports = { SEGMENTOS, pertenceAoSegmento, filtrarPorSegmento, contarSegmentos };
