/**
 * Espelho, no frontend, dos segmentos calculados em
 * functions/src/assinatura/segmentacao.js — só para filtrar a tabela de
 * clientes localmente sem bater na API a cada clique. A fonte da verdade
 * continua o backend: `/plataforma/segmentos` (contagem) e
 * `/plataforma/mensagens/broadcast` (quem realmente recebe) recalculam do
 * zero na hora de enviar, então uma divergência aqui só afeta o filtro
 * visual, nunca quem recebe mensagem.
 *
 * Os campos usados (`status`, `plano`, `emCarencia`, `motivo`) já vêm prontos
 * de `GET /plataforma/familias`.
 */

export const SEGMENTOS_CLIENTE = [
  { chave: 'todas', rotulo: 'Todas' },
  { chave: 'precisam_contato', rotulo: 'Precisam de contato' },
  { chave: 'trial', rotulo: 'Em trial' },
  { chave: 'trial_vencido', rotulo: 'Trial vencido' },
  { chave: 'pagantes', rotulo: 'Pagantes' },
  { chave: 'carencia', rotulo: 'Em carência' },
  { chave: 'atrasadas', rotulo: 'Atrasadas' },
  { chave: 'cortesias', rotulo: 'Cortesias' },
  { chave: 'canceladas', rotulo: 'Canceladas' },
];

export function pertenceAoSegmentoCliente(f, segmento) {
  switch (segmento) {
    case 'todas': return true;
    case 'trial': return f.motivo === 'TRIAL';
    case 'trial_vencido': return f.motivo === 'TRIAL_VENCIDO';
    case 'pagantes': return f.status === 'active' && f.plano !== 'interno';
    case 'carencia': return !!f.emCarencia;
    case 'atrasadas': return f.status === 'past_due';
    case 'cortesias': return f.plano === 'interno';
    case 'canceladas': return f.status === 'canceled';
    case 'precisam_contato':
      return f.status === 'past_due' || !!f.emCarencia || f.motivo === 'TRIAL_VENCIDO';
    default: return false;
  }
}
