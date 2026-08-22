/**
 * Chamados vistos pelo OPERADOR — a única leitura cross-tenant da feature.
 *
 * Este arquivo usa `db` cru de propósito, e é o único que pode. A fila do
 * suporte precisa enxergar todas as famílias, exatamente como `routes/admin.js`
 * já faz para o painel gestor — é a mesma exceção declarada da regra 3, e ela
 * fica concentrada aqui para ser visível na revisão de código. Espelha
 * `adminAuditService.js`, que existe pelo mesmo motivo.
 *
 * **Nenhuma escrita usa `db` cru.** As ações do operador moram aqui, mas cada
 * uma faz a mesma coisa: descobre o chamado cross-tenant, lê o `householdId`
 * dele e escreve através de `chamadoService` com `escopoDe(householdId)`. Assim
 * existe um caminho de escrita só no sistema, e ele é escopado — o operador
 * ganha o direito de DESCOBRIR o chamado, nunca o de escrever fora da barreira.
 *
 * Toda ação de operador grava em `adminAuditLog`: é atendimento a cliente sendo
 * feito fora do fluxo normal, então precisa de rastro, igual às outras ações do
 * painel gestor.
 *
 * Nenhuma query daqui tem `orderBy` (regra 12): `where` em status mais ordenação
 * por data exigiria índice composto, e o dublê dos testes não reproduz essa
 * exigência — foi assim que o drill-down do painel gestor nasceu quebrado em
 * produção. Ordena em memória, com teto de registros.
 */

const {
  STATUS, AUTORES, ABERTOS, MOTIVOS_RESOLUCAO, RESOLVIDO_PELO_SISTEMA, venceuPorInatividade,
} = require('../chamados/estado');

const COLECAO = 'supportTickets';

/**
 * Teto de registros por consulta da fila.
 *
 * Bater neste número é o sinal de que chegou a hora de assumir índice composto
 * e cursor de verdade — está registrado como dívida na spec. Até lá, carregar
 * tudo sem teto seria a fila engordando em silêncio até a tela travar.
 */
const TETO_DA_FILA = 200;

/** Teto da varredura diária. O que sobrar entra na rodada do dia seguinte. */
const TETO_DA_VARREDURA = 500;

/** Campos que a LISTA mostra. `mensagens` fora: a fila baixaria toda conversa. */
const CAMPOS_DA_FILA = [
  'numero', 'assunto', 'categoria', 'status', 'householdId',
  'aguardandoOperadorDesde', 'ultimaMensagemEm', 'ultimaMensagemPor',
  'naoLidoPeloOperador', 'quantidadeMensagens', 'atribuidoA', 'criadoEm',
  'reaberturaDe', 'resolvidoEm', 'motivoResolucao',
];

function criarChamadosPlataformaService({
  db, escopoDe, chamadoService, anexoService, auditar, notificar,
}) {
  function serializar(valor) {
    if (valor == null) return valor;
    if (typeof valor.toDate === 'function') return valor.toDate().toISOString();
    if (Array.isArray(valor)) return valor.map(serializar);
    if (typeof valor === 'object') {
      return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, serializar(v)]));
    }
    return valor;
  }

  /** Milissegundos de qualquer formato de data, para ordenar sem erro de tipo. */
  function ms(valor) {
    if (!valor) return null;
    if (typeof valor.toMillis === 'function') return valor.toMillis();
    if (typeof valor.toDate === 'function') return valor.toDate().getTime();
    const n = new Date(valor).getTime();
    return Number.isNaN(n) ? null : n;
  }

  /**
   * A fila.
   *
   * Ordena por `aguardandoOperadorDesde` mais antigo — quem espera há mais
   * tempo primeiro. Não por `ultimaMensagemEm`, que sobe também quando o
   * operador responde e portanto colocaria na frente justamente quem acabou de
   * ser atendido.
   *
   * Chamado sem espera pendente (o operador já respondeu, ou está resolvido)
   * vai para o fim, ordenado pela última atividade: ele está na lista para
   * consulta, não para ser atendido agora.
   */
  async function listarFila({ status = null, limite = TETO_DA_FILA } = {}) {
    let query = db.collection(COLECAO);
    if (status) query = query.where('status', '==', status);

    const snap = await query.select(...CAMPOS_DA_FILA).get();

    const todos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const ordenados = todos.sort((a, b) => {
      const esperaA = ms(a.aguardandoOperadorDesde);
      const esperaB = ms(b.aguardandoOperadorDesde);

      if (esperaA && esperaB) return esperaA - esperaB;
      if (esperaA) return -1;
      if (esperaB) return 1;

      return (ms(b.ultimaMensagemEm) ?? 0) - (ms(a.ultimaMensagemEm) ?? 0);
    });

    const teto = Math.min(Number(limite) || TETO_DA_FILA, TETO_DA_FILA);
    const pagina = ordenados.slice(0, teto);

    if (todos.length > teto) {
      console.warn(`[Chamados] Fila com ${todos.length} registros, acima do teto de ${teto}.`);
    }

    return {
      chamados: pagina.map(serializar),
      total: todos.length,
      // A tela avisa em vez de mentir que a lista está completa.
      truncada: todos.length > teto,
      abertos: todos.filter((c) => ABERTOS.includes(c.status)).length,
      naoLidos: todos.filter((c) => c.naoLidoPeloOperador === true).length,
    };
  }

  /**
   * Acha o chamado pelo número, atravessando famílias.
   *
   * Devolve o documento inteiro, com o `householdId` — é esse campo que o
   * chamador usa para montar o `escopoDe` e escrever pela porta certa.
   */
  async function buscarPorNumero(numero) {
    const doc = await db.collection(COLECAO).doc(String(numero)).get();
    if (!doc.exists) return null;

    return { id: doc.id, ...doc.data() };
  }

  /** Operadores que podem receber um encaminhamento. */
  async function listarOperadoresAtivos() {
    const snap = await db.collection('operadores').where('ativo', '==', true).get();

    return snap.docs
      .map((d) => ({ uid: d.id, nome: d.data().nome || d.id, papel: d.data().papel || 'ATENDENTE' }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  /** Um operador pelo uid, ativo ou não — para mostrar quem atendeu no histórico. */
  async function buscarOperador(uid) {
    if (!uid) return null;
    const doc = await db.collection('operadores').doc(uid).get();
    if (!doc.exists) return null;

    return { uid: doc.id, ...doc.data() };
  }

  /**
   * Chamados parados esperando o cliente há tempo demais.
   *
   * Filtra só por status no Firestore e corta a data em memória: igualdade em
   * `status` mais range em data é índice composto, o mesmo problema já
   * reconhecido na fila.
   *
   * Devolve `{ numero, householdId }` — quem encerra faz isso pelo
   * `chamadoService`, escopado, e não daqui.
   */
  async function vencidosPorInatividade(agora = new Date()) {
    const snap = await db.collection(COLECAO)
      .where('status', '==', STATUS.AGUARDANDO_CLIENTE)
      .select('numero', 'householdId', 'status', 'statusAlteradoEm', 'ultimaMensagemEm')
      .limit(TETO_DA_VARREDURA)
      .get();

    if (snap.size === TETO_DA_VARREDURA) {
      console.warn(
        `[Chamados] Varredura bateu o teto de ${TETO_DA_VARREDURA}. `
        + 'O restante entra na rodada de amanhã.',
      );
    }

    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => venceuPorInatividade(c, agora))
      .map((c) => ({ numero: c.numero ?? Number(c.id), householdId: c.householdId }));
  }

  /**
   * Avisos que não chegaram ao destino.
   *
   * Sem `orderBy` (regra 12): igualdade em `resolvida` mais ordenação por data
   * exigiria índice composto. A lista é curta por natureza — se não for, é
   * porque algo está quebrado, e aí o problema não é a paginação.
   *
   * Só as não resolvidas: a tela existe para mostrar pendência, não histórico.
   */
  async function notificacoesNaoEntregues(limite = 50) {
    const snap = await db.collection('notificacoesNaoEntregues')
      .where('resolvida', '==', false)
      .get();

    return snap.docs
      .map((d) => serializar({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')))
      .slice(0, limite);
  }

  /**
   * Baixa manual: o operador avisou a pessoa por fora e marca como resolvido.
   *
   * Não apaga o registro — guarda quem deu baixa e quando. Apagar seria perder
   * a única evidência de que alguém tratou uma falha de entrega.
   */
  async function resolverNotificacao(id, operador) {
    const ref = db.collection('notificacoesNaoEntregues').doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
      throw Object.assign(new Error('Aviso não encontrado.'), { statusCode: 404 });
    }
    if (doc.data().resolvida === true) return { id, jaEstava: true };

    await ref.update({
      resolvida: true,
      resolvidaPor: operador.uid,
      resolvidaEm: new Date(),
    });

    return { id, jaEstava: false };
  }

  // ---------------------------------------------------------------------------
  // Ações do operador. Descobrem cross-tenant, escrevem escopado.
  // ---------------------------------------------------------------------------

  function naoEncontrado() {
    return Object.assign(new Error('Chamado não encontrado.'), { statusCode: 404 });
  }

  /** Acha o chamado e devolve o acessor já travado na família dele. */
  async function acessoAoChamado(numero) {
    const chamado = await buscarPorNumero(numero);
    if (!chamado) throw naoEncontrado();

    return { chamado, dados: escopoDe(chamado.householdId) };
  }

  /** O chamado inteiro, com mensagens, e o indicador do operador apagado. */
  async function abrirChamado(numero, operador) {
    const { chamado, dados } = await acessoAoChamado(numero);

    await chamadoService.marcarComoLido(dados, numero, AUTORES.SUPORTE);

    const completo = await chamadoService.buscarChamado(dados, numero);
    const atribuido = await buscarOperador(chamado.atribuidoA);

    return {
      ...completo,
      naoLidoPeloOperador: false,
      atribuidoNome: atribuido?.nome || null,
    };
  }

  /**
   * Os BYTES de um anexo, para o operador — mesma trava do lado cliente
   * (`chamadoController.baixarAnexo`), só que a descoberta do chamado
   * atravessa famílias em vez de vir do `req.dados` de um household só.
   *
   * `acessoAoChamado` já recusa número inexistente; a partir daí o
   * `householdId` do PRÓPRIO chamado é o único que entra no `lerAnexo` — um
   * `anexoId` de outro chamado nunca resolve, porque `storagePath` não bate
   * com a pasta desta família.
   */
  async function baixarAnexo(numero, anexoId) {
    const { chamado, dados } = await acessoAoChamado(numero);

    const completo = await chamadoService.buscarChamado(dados, numero);
    const anexo = (completo?.mensagens || [])
      .flatMap((m) => m.anexos || [])
      .find((a) => a.id === anexoId);

    if (!anexo) throw Object.assign(new Error('Anexo não encontrado.'), { statusCode: 404 });

    return anexoService.lerAnexo(chamado.householdId, anexo.storagePath);
  }

  async function responderComoSuporte(numero, { texto, anexos }, operador, agora = new Date()) {
    const { chamado, dados } = await acessoAoChamado(numero);

    const resultado = await chamadoService.responder(dados, numero, {
      autor: AUTORES.SUPORTE,
      // O nome que aparece para o cliente é o do operador logado, nunca algo
      // vindo do corpo da requisição.
      autorNome: operador.nome || 'Suporte',
      texto,
      anexos,
    }, agora);

    await auditar({
      adminUid: operador.uid,
      adminEmail: operador.nome || null,
      acao: 'CHAMADO_RESPONDIDO',
      householdId: chamado.householdId,
      detalhes: { numero: Number(numero) },
    });

    // Aguardado, nunca disparado e esquecido: no Cloud Run a CPU congela
    // quando a resposta HTTP sai e a promessa pendente morre no meio.
    await notificar.suporteRespondeu({
      numero: Number(numero),
      householdId: chamado.householdId,
      ownerId: chamado.abertoPor?.uid || null,
    });

    return resultado;
  }

  /**
   * Encaminha para outro operador ATIVO.
   *
   * Operador inativo é recusado aqui, e não só na tela: a lista do seletor vem
   * de `listarOperadoresAtivos`, mas quem manda um `paraUid` na requisição não
   * precisa ter passado pela tela.
   */
  async function encaminhar(numero, paraUid, operador) {
    const destino = await buscarOperador(paraUid);

    if (!destino || destino.ativo !== true) {
      throw Object.assign(
        new Error('Operador inválido ou desativado.'),
        { statusCode: 400, codigo: 'DESTINATARIO_INVALIDO' },
      );
    }

    const { chamado, dados } = await acessoAoChamado(numero);

    const resultado = await chamadoService.encaminhar(dados, numero, { paraUid });

    await auditar({
      adminUid: operador.uid,
      adminEmail: operador.nome || null,
      acao: 'CHAMADO_ENCAMINHADO',
      householdId: chamado.householdId,
      detalhes: { numero: Number(numero), para: paraUid, paraNome: destino.nome || null },
    });

    await notificar.chamadoEncaminhado({
      numero: Number(numero),
      householdId: chamado.householdId,
      // `email` é o endereço REAL, opcional no cadastro do operador. O login
      // dele é um e-mail interno que ninguém lê, então sem este campo o aviso
      // cai na caixa da equipe.
      para: { nome: destino.nome || null, email: destino.email || null },
    });

    return { ...resultado, paraNome: destino.nome || null };
  }

  async function resolverComoOperador(numero, operador, agora = new Date()) {
    const { chamado, dados } = await acessoAoChamado(numero);

    const resultado = await chamadoService.resolver(dados, numero, {
      motivo: MOTIVOS_RESOLUCAO.OPERADOR,
      porQuem: operador.uid,
    }, agora);

    await auditar({
      adminUid: operador.uid,
      adminEmail: operador.nome || null,
      acao: 'CHAMADO_RESOLVIDO',
      householdId: chamado.householdId,
      detalhes: { numero: Number(numero) },
    });

    return resultado;
  }

  /**
   * Encerra os chamados parados esperando o cliente. Corpo da varredura diária.
   *
   * Mora aqui, e não no `chamadoService`, porque a DESCOBERTA é cross-tenant —
   * é o mesmo motivo de a fila estar neste arquivo. A escrita continua indo
   * pelo `chamadoService` com `escopoDe`, uma família por vez.
   *
   * try/catch POR CHAMADO: um documento estranho não pode impedir os outros de
   * serem encerrados, senão a fila do operador enche de chamado morto porque um
   * único registro deu problema.
   *
   * Não avisa ninguém de propósito. Encerrar por silêncio é consequência de o
   * cliente não ter respondido; mandar um aviso por isso seria cobrar dele a
   * própria ausência. É a mesma razão de `camposDeResolucao` não acender o
   * indicador de não lido neste caso.
   */
  async function resolverInativos(agora = new Date()) {
    const vencidos = await vencidosPorInatividade(agora);

    if (!vencidos.length) {
      console.log('[Chamados] Nenhum chamado vencido por inatividade.');
      return { encontrados: 0, resolvidos: 0, falhas: 0 };
    }

    let resolvidos = 0;
    let falhas = 0;

    for (const { numero, householdId } of vencidos) {
      try {
        await chamadoService.resolver(escopoDe(householdId), numero, {
          motivo: MOTIVOS_RESOLUCAO.INATIVIDADE_CLIENTE,
          porQuem: RESOLVIDO_PELO_SISTEMA,
        }, agora);
        resolvidos += 1;
      } catch (err) {
        falhas += 1;
        console.error(`[Chamados] Falhou ao encerrar #${numero}:`, err.message);
      }
    }

    console.log(`[Chamados] Encerrados por inatividade: ${resolvidos} de ${vencidos.length}.`);
    return { encontrados: vencidos.length, resolvidos, falhas };
  }

  return {
    listarFila,
    buscarPorNumero,
    listarOperadoresAtivos,
    buscarOperador,
    vencidosPorInatividade,
    resolverInativos,
    notificacoesNaoEntregues,
    resolverNotificacao,
    abrirChamado,
    baixarAnexo,
    responderComoSuporte,
    encaminhar,
    resolverComoOperador,
  };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { db } = require('../config/firebaseAdmin');
    const { escopoDe } = require('../data/escopo');
    const chamadoService = require('./chamadoService');
    const anexoService = require('./anexoService');
    const adminAuditService = require('./adminAuditService');

    _padrao = criarChamadosPlataformaService({
      db,
      escopoDe,
      chamadoService,
      anexoService,
      auditar: adminAuditService.registrar,
      notificar: require('./notificacaoChamadoService'),
    });
  }
  return _padrao;
}

module.exports = {
  criarChamadosPlataformaService,
  TETO_DA_FILA,
  TETO_DA_VARREDURA,
  CAMPOS_DA_FILA,
  listarFila: (...a) => servico().listarFila(...a),
  buscarPorNumero: (...a) => servico().buscarPorNumero(...a),
  listarOperadoresAtivos: (...a) => servico().listarOperadoresAtivos(...a),
  buscarOperador: (...a) => servico().buscarOperador(...a),
  vencidosPorInatividade: (...a) => servico().vencidosPorInatividade(...a),
  resolverInativos: (...a) => servico().resolverInativos(...a),
  notificacoesNaoEntregues: (...a) => servico().notificacoesNaoEntregues(...a),
  resolverNotificacao: (...a) => servico().resolverNotificacao(...a),
  abrirChamado: (...a) => servico().abrirChamado(...a),
  baixarAnexo: (...a) => servico().baixarAnexo(...a),
  responderComoSuporte: (...a) => servico().responderComoSuporte(...a),
  encaminhar: (...a) => servico().encaminhar(...a),
  resolverComoOperador: (...a) => servico().resolverComoOperador(...a),
};
