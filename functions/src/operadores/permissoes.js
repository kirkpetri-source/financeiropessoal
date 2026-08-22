/**
 * O que cada papel de operador pode fazer.
 *
 * Até 22/08/2026 `papel` era só um rótulo guardado no documento: quem entrasse
 * no painel via tudo, e a única separação real era `apenasAdmin` (que vem do
 * `.env`, não do banco). Isso significava que contratar um atendente para
 * responder chamado entregava junto o faturamento, o botão de apagar família e
 * o disparo de mensagem em massa.
 *
 * A matriz mora aqui, em arquivo próprio e sem dependência nenhuma, porque ela
 * é lida pelo backend (para autorizar) e enviada ao frontend (para esconder o
 * que não adianta mostrar). São usos diferentes da MESMA fonte — duas listas
 * divergiriam, e a que divergisse a favor do usuário viraria brecha.
 *
 * REGRA DE OURO: quem autoriza é o backend. O frontend usa isto para não
 * oferecer um botão que vai falhar; nunca como segurança.
 */

/**
 * Capacidades, do menos para o mais perigoso.
 *
 * Nomes descrevem a AÇÃO, não a tela — telas mudam de nome e de lugar, a
 * permissão de "apagar dados de cliente" continua sendo a mesma coisa.
 */
const CAPACIDADES = {
  // Atendimento
  VER_CHAMADOS: 'verChamados',
  RESPONDER_CHAMADOS: 'responderChamados',
  ENCAMINHAR_CHAMADOS: 'encaminharChamados',

  // Clientes
  VER_CLIENTES: 'verClientes',
  ANOTAR_CLIENTE: 'anotarCliente',
  MENSAGEM_DIRETA: 'mensagemDireta',

  // Dinheiro e métricas
  VER_FINANCEIRO: 'verFinanceiro',
  VER_CUSTOS_IA: 'verCustosIA',

  // Ações que mexem na conta do cliente
  GERIR_ASSINATURA: 'gerirAssinatura',
  BLOQUEAR_CLIENTE: 'bloquearCliente',
  DISPARO_EM_MASSA: 'disparoEmMassa',

  // Dono do negócio
  GERIR_OPERADORES: 'gerirOperadores',
  APAGAR_DADOS: 'apagarDados',
  OPERAR_SISTEMA: 'operarSistema',
};

const TODAS = Object.values(CAPACIDADES);

/**
 * Papéis. A ordem importa: cada um é um degrau, e a tela mostra nessa ordem.
 *
 * ATENDENTE é o padrão em toda dúvida (ver `middlewares/operador.js`): papel
 * desconhecido no banco não pode promover ninguém.
 */
const PAPEIS = {
  ATENDENTE: 'ATENDENTE',
  SUPORTE_SENIOR: 'SUPORTE_SENIOR',
  FINANCEIRO: 'FINANCEIRO',
  ADMIN: 'ADMIN',
};

const DESCRICAO = {
  [PAPEIS.ATENDENTE]: 'Responde chamados. Não vê faturamento nem mexe em assinatura.',
  [PAPEIS.SUPORTE_SENIOR]: 'Tudo do atendente, mais encaminhar, anotar no cliente e falar direto com ele.',
  [PAPEIS.FINANCEIRO]: 'Enxerga o financeiro e administra assinaturas. Não apaga dados nem cria operador.',
  [PAPEIS.ADMIN]: 'Acesso completo, incluindo criar operadores e apagar dados de cliente.',
};

const MATRIZ = {
  [PAPEIS.ATENDENTE]: [
    CAPACIDADES.VER_CHAMADOS,
    CAPACIDADES.RESPONDER_CHAMADOS,
    CAPACIDADES.VER_CLIENTES,
  ],
  [PAPEIS.SUPORTE_SENIOR]: [
    CAPACIDADES.VER_CHAMADOS,
    CAPACIDADES.RESPONDER_CHAMADOS,
    CAPACIDADES.ENCAMINHAR_CHAMADOS,
    CAPACIDADES.VER_CLIENTES,
    CAPACIDADES.ANOTAR_CLIENTE,
    CAPACIDADES.MENSAGEM_DIRETA,
  ],
  [PAPEIS.FINANCEIRO]: [
    CAPACIDADES.VER_CHAMADOS,
    CAPACIDADES.RESPONDER_CHAMADOS,
    CAPACIDADES.VER_CLIENTES,
    CAPACIDADES.ANOTAR_CLIENTE,
    CAPACIDADES.MENSAGEM_DIRETA,
    CAPACIDADES.VER_FINANCEIRO,
    CAPACIDADES.VER_CUSTOS_IA,
    CAPACIDADES.GERIR_ASSINATURA,
  ],
  [PAPEIS.ADMIN]: TODAS,
};

/** As capacidades de um papel. Papel desconhecido cai no MENOR privilégio. */
function capacidadesDe(papel) {
  return MATRIZ[papel] || MATRIZ[PAPEIS.ATENDENTE];
}

/**
 * O papel pode fazer isso?
 *
 * `permissoesExtras` permite conceder uma capacidade avulsa a uma pessoa sem
 * promovê-la de papel — o caso real é o atendente de confiança que precisa
 * encaminhar, mas não deve ver faturamento. Só ACRESCENTA: não existe remoção
 * por aqui, porque uma exceção que TIRA permissão vira uma segunda matriz
 * escondida, e ninguém mais consegue responder "quem pode o quê" olhando os
 * papéis.
 */
function podeFazer(papel, capacidade, permissoesExtras = []) {
  if (!TODAS.includes(capacidade)) return false;
  return capacidadesDe(papel).includes(capacidade)
    || (Array.isArray(permissoesExtras) && permissoesExtras.includes(capacidade));
}

/** Tudo que a pessoa pode, papel + extras, sem repetição. Vai para a tela. */
function permissoesEfetivas(papel, permissoesExtras = []) {
  const extras = (Array.isArray(permissoesExtras) ? permissoesExtras : [])
    .filter((p) => TODAS.includes(p));
  return [...new Set([...capacidadesDe(papel), ...extras])];
}

/** Rótulos para a tela de permissões — o operador não deve ler camelCase. */
const ROTULOS = {
  [CAPACIDADES.VER_CHAMADOS]: 'Ver a fila de chamados',
  [CAPACIDADES.RESPONDER_CHAMADOS]: 'Responder chamados',
  [CAPACIDADES.ENCAMINHAR_CHAMADOS]: 'Encaminhar chamado para outro operador',
  [CAPACIDADES.VER_CLIENTES]: 'Ver a lista de clientes',
  [CAPACIDADES.ANOTAR_CLIENTE]: 'Escrever anotações no cliente',
  [CAPACIDADES.MENSAGEM_DIRETA]: 'Mandar mensagem para um cliente',
  [CAPACIDADES.VER_FINANCEIRO]: 'Ver faturamento e métricas',
  [CAPACIDADES.VER_CUSTOS_IA]: 'Ver custo de IA e infraestrutura',
  [CAPACIDADES.GERIR_ASSINATURA]: 'Mexer em assinatura (pagamento manual, cancelar)',
  [CAPACIDADES.BLOQUEAR_CLIENTE]: 'Bloquear e desbloquear cliente',
  [CAPACIDADES.DISPARO_EM_MASSA]: 'Disparar mensagem para várias famílias',
  [CAPACIDADES.GERIR_OPERADORES]: 'Criar, editar e desativar operadores',
  [CAPACIDADES.APAGAR_DADOS]: 'Apagar dados de uma família (LGPD)',
  [CAPACIDADES.OPERAR_SISTEMA]: 'Rodar backup e ver saúde do sistema',
};

module.exports = {
  CAPACIDADES,
  PAPEIS,
  MATRIZ,
  TODAS,
  DESCRICAO,
  ROTULOS,
  capacidadesDe,
  podeFazer,
  permissoesEfetivas,
};
