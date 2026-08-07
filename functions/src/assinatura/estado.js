/**
 * Estado da assinatura — a regra que decide se a família pode continuar usando.
 *
 * Fica separado do Firestore e do Mercado Pago de propósito: é a única parte do
 * billing que pode negar acesso a um cliente pagante, então precisa ser
 * testável sem rede, sem banco e sem relógio real (o `agora` entra por
 * parâmetro).
 *
 * Princípio adotado: **bloqueio nunca apaga nem esconde dado**. Quem deixa de
 * pagar perde o direito de LANÇAR, não o direito de ver e exportar o próprio
 * histórico. Sequestrar dado financeiro de família para forçar pagamento é
 * ruim de produto e problemático na LGPD.
 */

const PRECO_MENSAL_CENTAVOS = 2490;

const DIAS_DE_TRIAL = 7;

// Depois do vencimento o Mercado Pago ainda tenta cobrar de novo por alguns
// dias. Cortar o acesso no primeiro dia de atraso derrubaria cliente que vai
// pagar sozinho — e cada corte indevido custa mais que cinco dias de uso.
const DIAS_DE_CARENCIA = 5;

const STATUS = {
  TRIAL: 'trialing',
  PENDENTE: 'pending',      // checkout criado, cliente ainda não autorizou
  ATIVA: 'active',
  ATRASADA: 'past_due',     // cobrança falhou, dentro ou fora da carência
  PAUSADA: 'paused',
  CANCELADA: 'canceled',
};

const MOTIVOS = {
  SEM_ASSINATURA: 'SEM_ASSINATURA',
  TRIAL: 'TRIAL',
  TRIAL_VENCIDO: 'TRIAL_VENCIDO',
  EM_DIA: 'EM_DIA',
  CARENCIA: 'CARENCIA',
  PAGAMENTO_ATRASADO: 'PAGAMENTO_ATRASADO',
  CANCELADA: 'CANCELADA',
  PAUSADA: 'PAUSADA',
  AGUARDANDO_PAGAMENTO: 'AGUARDANDO_PAGAMENTO',
};

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/**
 * Aceita Timestamp do Firestore, Date, número ou string ISO e devolve Date.
 * Devolve null no que não vira data válida — data inválida não pode virar
 * "epoch", senão toda assinatura sem campo preenchido apareceria vencida.
 */
function paraData(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === 'function') return valor.toDate();
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diasEntre(inicio, fim) {
  return Math.ceil((fim.getTime() - inicio.getTime()) / DIA_EM_MS);
}

function somarDias(data, dias) {
  return new Date(data.getTime() + dias * DIA_EM_MS);
}

/**
 * Situação completa da assinatura de uma família.
 *
 * @param {object|null} assinatura  o campo `subscription` do household
 * @param {Date} agora
 * @returns {{
 *   status: string,
 *   podeLancar: boolean,
 *   motivo: string,
 *   emTrial: boolean,
 *   emCarencia: boolean,
 *   expiraEm: Date|null,
 *   diasRestantes: number|null,
 *   precisaPagar: boolean
 * }}
 */
function situacaoDaAssinatura(assinatura, agora = new Date()) {
  const base = {
    status: assinatura?.status || null,
    podeLancar: false,
    motivo: MOTIVOS.SEM_ASSINATURA,
    emTrial: false,
    emCarencia: false,
    expiraEm: null,
    diasRestantes: null,
    precisaPagar: true,
  };

  if (!assinatura || !assinatura.status) return base;

  const fimDoTrial = paraData(assinatura.trialEndsAt);
  const fimDoPeriodo = paraData(assinatura.currentPeriodEnd);

  // O trial vale em paralelo ao status do provedor. Alguém que iniciou o
  // checkout no dia 3 do trial fica com status "pending" no Mercado Pago e não
  // pode ser bloqueado por isso — ainda tem 11 dias de trial contratados.
  const trialVigente = !!fimDoTrial && fimDoTrial > agora;

  switch (assinatura.status) {
    case STATUS.ATIVA: {
      // Sem currentPeriodEnd (assinatura recém-autorizada, antes do primeiro
      // webhook de pagamento) confiamos no status: o provedor só devolve
      // "authorized" depois de validar o meio de pagamento.
      const limite = fimDoPeriodo ? somarDias(fimDoPeriodo, DIAS_DE_CARENCIA) : null;

      if (!limite || limite > agora) {
        const dentroDoPeriodo = !fimDoPeriodo || fimDoPeriodo > agora;
        return {
          ...base,
          podeLancar: true,
          precisaPagar: false,
          motivo: dentroDoPeriodo ? MOTIVOS.EM_DIA : MOTIVOS.CARENCIA,
          emCarencia: !dentroDoPeriodo,
          expiraEm: fimDoPeriodo,
          diasRestantes: fimDoPeriodo ? diasEntre(agora, fimDoPeriodo) : null,
        };
      }

      return { ...base, motivo: MOTIVOS.PAGAMENTO_ATRASADO, expiraEm: fimDoPeriodo, diasRestantes: 0 };
    }

    case STATUS.ATRASADA: {
      const limite = fimDoPeriodo ? somarDias(fimDoPeriodo, DIAS_DE_CARENCIA) : null;

      if (limite && limite > agora) {
        return {
          ...base,
          podeLancar: true,
          motivo: MOTIVOS.CARENCIA,
          emCarencia: true,
          expiraEm: fimDoPeriodo,
          diasRestantes: diasEntre(agora, limite),
        };
      }

      if (trialVigente) return emTrial(base, fimDoTrial, agora);

      return { ...base, motivo: MOTIVOS.PAGAMENTO_ATRASADO, expiraEm: fimDoPeriodo, diasRestantes: 0 };
    }

    case STATUS.CANCELADA: {
      // Cancelou no dia 10 mas o mês foi pago até o dia 30: usa até o dia 30.
      if (fimDoPeriodo && fimDoPeriodo > agora) {
        return {
          ...base,
          podeLancar: true,
          motivo: MOTIVOS.CANCELADA,
          expiraEm: fimDoPeriodo,
          diasRestantes: diasEntre(agora, fimDoPeriodo),
        };
      }
      if (trialVigente) return emTrial(base, fimDoTrial, agora);
      return { ...base, motivo: MOTIVOS.CANCELADA, expiraEm: fimDoPeriodo, diasRestantes: 0 };
    }

    case STATUS.PAUSADA: {
      if (trialVigente) return emTrial(base, fimDoTrial, agora);
      return { ...base, motivo: MOTIVOS.PAUSADA, expiraEm: fimDoPeriodo };
    }

    case STATUS.PENDENTE: {
      if (trialVigente) return emTrial(base, fimDoTrial, agora);
      return { ...base, motivo: MOTIVOS.AGUARDANDO_PAGAMENTO };
    }

    case STATUS.TRIAL: {
      if (trialVigente) return emTrial(base, fimDoTrial, agora);
      return { ...base, motivo: MOTIVOS.TRIAL_VENCIDO, expiraEm: fimDoTrial, diasRestantes: 0 };
    }

    default:
      return { ...base, motivo: MOTIVOS.SEM_ASSINATURA };
  }
}

function emTrial(base, fimDoTrial, agora) {
  return {
    ...base,
    podeLancar: true,
    emTrial: true,
    motivo: MOTIVOS.TRIAL,
    expiraEm: fimDoTrial,
    diasRestantes: diasEntre(agora, fimDoTrial),
  };
}

/** Atalho usado no middleware e nas respostas de API. */
function assinaturaAtiva(household, agora = new Date()) {
  return situacaoDaAssinatura(household?.subscription, agora).podeLancar;
}

/**
 * Texto curto para o cliente. Fica aqui, e não no frontend, porque o WhatsApp
 * também precisa avisar — e a mensagem tem que ser a mesma nos dois canais.
 */
function mensagemDaSituacao(situacao) {
  switch (situacao.motivo) {
    case MOTIVOS.TRIAL:
      return situacao.diasRestantes <= 3
        ? `Seu teste grátis termina em ${situacao.diasRestantes} dia(s). Assine para não perder o acesso.`
        : `Teste grátis: ${situacao.diasRestantes} dias restantes.`;
    case MOTIVOS.TRIAL_VENCIDO:
      return 'Seu teste grátis acabou. Assine para voltar a lançar — seus dados continuam aqui.';
    case MOTIVOS.EM_DIA:
      return 'Assinatura em dia.';
    case MOTIVOS.CARENCIA:
      return 'Não conseguimos confirmar seu pagamento. Atualize a forma de pagamento para não perder o acesso.';
    case MOTIVOS.PAGAMENTO_ATRASADO:
      return 'Assinatura suspensa por falta de pagamento. Regularize para voltar a lançar.';
    case MOTIVOS.CANCELADA:
      return situacao.podeLancar
        ? 'Assinatura cancelada. Você pode usar até o fim do período já pago.'
        : 'Assinatura cancelada. Assine de novo para voltar a lançar.';
    case MOTIVOS.PAUSADA:
      return 'Assinatura pausada. Retome no painel para voltar a lançar.';
    case MOTIVOS.AGUARDANDO_PAGAMENTO:
      return 'Estamos aguardando a confirmação do seu pagamento.';
    default:
      return 'Assine para começar a usar.';
  }
}

module.exports = {
  PRECO_MENSAL_CENTAVOS,
  DIAS_DE_TRIAL,
  DIAS_DE_CARENCIA,
  STATUS,
  MOTIVOS,
  paraData,
  situacaoDaAssinatura,
  assinaturaAtiva,
  mensagemDaSituacao,
};
