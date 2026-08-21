/**
 * Chamados de suporte — lado do CLIENTE.
 *
 * Tudo aqui passa por `escopoDe`, sempre. A leitura que atravessa famílias (a
 * fila do operador e a varredura diária) mora em `chamadosPlataformaService.js`,
 * separada de propósito: duas regras, dois arquivos, nenhuma dúvida na revisão
 * de código sobre qual delas está valendo.
 *
 * O operador ESCREVE por este mesmo service. Ele descobre o chamado pela fila
 * cross-tenant, mas para responder monta `escopoDe(householdId)` e cai aqui —
 * assim existe um caminho de escrita só, e ele é escopado.
 *
 * Duas restrições do Firestore moldam o código:
 *
 *   - `serverTimestamp()` NÃO funciona dentro de item de array. A data da
 *     mensagem é `Timestamp.fromDate(agora)`, com `agora` vindo do relógio do
 *     Cloud Run, que É o servidor.
 *   - transação lê tudo antes de escrever qualquer coisa. Por isso o contador
 *     é lido primeiro e o chamado criado depois, na mesma transação.
 */

const crypto = require('crypto');
const {
  STATUS, AUTORES, LIMITES, MOTIVOS_RESOLUCAO,
  estaAberto, decidirTransicao, camposDeResolucao,
} = require('../chamados/estado');

const COLECAO = 'supportTickets';
const DOC_CONTADOR = 'supportTickets';

function erro(mensagem, statusCode, codigo) {
  return Object.assign(new Error(mensagem), { statusCode, codigo });
}

function criarChamadoService({ db, admin }) {
  const { FieldValue, Timestamp } = admin.firestore;

  const paraTimestamp = (v) => (v instanceof Date ? Timestamp.fromDate(v) : v);

  /** Datas viram ISO: Timestamp do Firestore não sobrevive ao res.json() de forma usável. */
  function serializar(valor) {
    if (valor == null) return valor;
    if (typeof valor.toDate === 'function') return valor.toDate().toISOString();
    if (Array.isArray(valor)) return valor.map(serializar);
    if (typeof valor === 'object') {
      return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, serializar(v)]));
    }
    return valor;
  }

  function montarMensagem({ autor, autorNome, texto, anexos = [] }, agora) {
    if (!Object.values(AUTORES).includes(autor)) {
      throw erro(`Autor inválido: ${autor}`, 400, 'AUTOR_INVALIDO');
    }

    const limpo = String(texto || '').trim();
    if (!limpo) throw erro('Escreva uma mensagem.', 400, 'MENSAGEM_VAZIA');
    if (limpo.length > LIMITES.CARACTERES_POR_MENSAGEM) {
      throw erro(
        `Mensagem muito longa (limite de ${LIMITES.CARACTERES_POR_MENSAGEM} caracteres).`,
        400, 'MENSAGEM_LONGA',
      );
    }
    if (anexos.length > LIMITES.ANEXOS_POR_MENSAGEM) {
      throw erro(
        `No máximo ${LIMITES.ANEXOS_POR_MENSAGEM} anexos por mensagem.`,
        400, 'ANEXOS_DEMAIS',
      );
    }

    return {
      id: crypto.randomUUID(),
      autor,
      autorNome: autorNome || null,
      texto: limpo,
      anexos,
      em: paraTimestamp(agora),
    };
  }

  /** Converte as datas que a máquina de estados devolveu como Date. */
  function comTimestamps(campos) {
    return Object.fromEntries(
      Object.entries(campos).map(([k, v]) => [k, paraTimestamp(v)]),
    );
  }

  /**
   * Quantos chamados a família tem em aberto.
   *
   * `.select('status')` de propósito: sem projeção, contar abertos baixaria o
   * array de mensagens de todos os chamados já abertos pela família.
   */
  async function contarAbertos(dados) {
    const snap = await dados.consultar(COLECAO).select('status').get();
    return snap.docs.filter((d) => estaAberto(d.data().status)).length;
  }

  /**
   * Abre um chamado. O número sai de `counters/supportTickets`, incrementado na
   * MESMA transação que cria o documento.
   *
   * O id do documento é o próprio número. Isso dá uma segunda trava de graça:
   * `create()` recusa id existente, então um contador que por qualquer motivo
   * repetisse um número falharia alto em vez de sobrescrever um chamado — mesma
   * lição da regra 15 e da 23.
   *
   * O teto de chamados abertos é conferido FORA da transação, e isso é
   * deliberado: é um freio antiabuso, não uma invariante. Duas requisições
   * simultâneas no limite podem abrir o sexto; prender uma query dentro da
   * transação por causa disso custaria contenção em toda abertura.
   */
  async function abrirChamado(dados, entrada, agora = new Date()) {
    const assunto = String(entrada.assunto || '').trim();
    if (!assunto) throw erro('Escreva o assunto do chamado.', 400, 'ASSUNTO_VAZIO');

    const abertos = await contarAbertos(dados);
    if (abertos >= LIMITES.CHAMADOS_ABERTOS_POR_FAMILIA) {
      throw erro(
        `Você já tem ${abertos} chamados em aberto. Acompanhe os existentes antes de abrir outro.`,
        409, 'CHAMADOS_DEMAIS',
      );
    }

    const mensagem = montarMensagem({ ...entrada, autor: AUTORES.CLIENTE }, agora);
    const refContador = db.collection('counters').doc(DOC_CONTADOR);
    const quando = paraTimestamp(agora);

    return db.runTransaction(async (tx) => {
      // Leitura ANTES de qualquer escrita: o Firestore recusa a ordem inversa.
      const doc = await tx.get(refContador);
      const numero = (doc.exists ? Number(doc.data().ultimo) || 0 : 0) + 1;

      tx.set(refContador, { ultimo: numero }, { merge: true });

      const ref = db.collection(COLECAO).doc(String(numero));

      dados.criarEmTransacao(tx, COLECAO, ref, {
        numero,
        assunto: assunto.slice(0, LIMITES.ASSUNTO_MAXIMO),
        categoria: entrada.categoria,
        status: STATUS.ABERTO,
        mensagens: [mensagem],
        quantidadeMensagens: 1,
        naoLidoPeloCliente: false,
        naoLidoPeloOperador: true,
        abertoPor: entrada.abertoPor || null,
        atribuidoA: null,
        atribuidoEm: null,
        aguardandoOperadorDesde: quando,
        ultimaMensagemEm: quando,
        ultimaMensagemPor: AUTORES.CLIENTE,
        statusAlteradoEm: quando,
        criadoEm: quando,
        resolvidoEm: null,
        resolvidoPor: null,
        motivoResolucao: null,
        reaberturaDe: entrada.reaberturaDe ?? null,
      });

      return { numero, id: String(numero) };
    });
  }

  /**
   * Responde a um chamado, de qualquer um dos dois lados.
   *
   * A decisão de transição é tomada DENTRO da transação, sobre o documento como
   * ele está naquele instante — não sobre uma leitura feita antes. É o que
   * sustenta cliente e operador respondendo quase juntos sem perder mensagem
   * nem embaralhar o status.
   */
  async function responder(dados, numero, entrada, agora = new Date()) {
    const mensagem = montarMensagem(entrada, agora);
    const id = String(numero);

    // Preenchido dentro da transação quando a resposta chega tarde demais para
    // reabrir. Não dá para abrir o chamado novo ali dentro: seria uma segunda
    // transação aninhada, e a numeração precisa da sua própria.
    let precisaDeChamadoNovo = null;

    const anterior = await dados.atualizarAtomico(COLECAO, id, (atual) => {
      const decisao = decidirTransicao(atual, entrada.autor, agora);

      if (decisao.acao === 'CHAMADO_NOVO') {
        precisaDeChamadoNovo = { anterior: atual, numeroAnterior: decisao.numeroAnterior };
        return null;
      }

      return {
        ...comTimestamps(decisao.campos),
        mensagens: FieldValue.arrayUnion(mensagem),
        quantidadeMensagens: FieldValue.increment(1),
      };
    });

    if (precisaDeChamadoNovo) {
      const novo = await abrirChamado(dados, {
        assunto: precisaDeChamadoNovo.anterior.assunto,
        categoria: precisaDeChamadoNovo.anterior.categoria,
        texto: entrada.texto,
        anexos: entrada.anexos,
        autorNome: entrada.autorNome,
        abertoPor: entrada.abertoPor,
        reaberturaDe: precisaDeChamadoNovo.numeroAnterior,
      }, agora);

      return { ...novo, chamadoNovo: true, reaberturaDe: precisaDeChamadoNovo.numeroAnterior };
    }

    return { numero: anterior.numero, id, chamadoNovo: false };
  }

  /** Marca resolvido. `motivo` distingue decisão de operador de encerramento por silêncio. */
  async function resolver(dados, numero, { motivo, porQuem }, agora = new Date()) {
    await dados.atualizarAtomico(COLECAO, String(numero), (atual) => {
      if (atual.status === STATUS.RESOLVIDO) return null; // já está, não reescreve
      return comTimestamps(camposDeResolucao({ motivo, porQuem }, agora));
    });

    return { numero: Number(numero), resolvido: true };
  }

  /**
   * Apaga o indicador de não lido de um dos lados.
   *
   * Devolver `null` quando já está apagado evita uma escrita por abertura de
   * tela — e evita mexer em `updatedAt` sem nada ter mudado.
   */
  async function marcarComoLido(dados, numero, quem) {
    const campo = quem === AUTORES.SUPORTE ? 'naoLidoPeloOperador' : 'naoLidoPeloCliente';

    await dados.atualizarAtomico(COLECAO, String(numero), (atual) => (
      atual[campo] === true ? { [campo]: false } : null
    ));
  }

  /**
   * Lista da família, sem as mensagens.
   *
   * Ordena em memória: `where` do tenant mais `orderBy` em outro campo exigiria
   * índice composto, e a lista de uma família tem dezenas de itens, não
   * milhares (regra 12).
   */
  async function listarChamados(dados) {
    const snap = await dados.consultar(COLECAO).select(
      'numero', 'assunto', 'categoria', 'status', 'naoLidoPeloCliente',
      'ultimaMensagemEm', 'ultimaMensagemPor', 'criadoEm', 'quantidadeMensagens',
      'reaberturaDe', 'resolvidoEm', 'motivoResolucao',
    ).get();

    return snap.docs
      .map((d) => serializar({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.ultimaMensagemEm || '').localeCompare(String(a.ultimaMensagemEm || '')));
  }

  /** O chamado inteiro, com as mensagens. Null quando não existe ou é de outra família. */
  async function buscarChamado(dados, numero) {
    const chamado = await dados.buscarDoc(COLECAO, String(numero));
    if (!chamado) return null;

    return serializar(chamado);
  }

  return {
    abrirChamado,
    responder,
    resolver,
    marcarComoLido,
    listarChamados,
    buscarChamado,
    contarAbertos,
  };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { admin, db } = require('../config/firebaseAdmin');
    _padrao = criarChamadoService({ db, admin });
  }
  return _padrao;
}

module.exports = {
  criarChamadoService,
  COLECAO,
  AUTORES,
  MOTIVOS_RESOLUCAO,
  abrirChamado: (...a) => servico().abrirChamado(...a),
  responder: (...a) => servico().responder(...a),
  resolver: (...a) => servico().resolver(...a),
  marcarComoLido: (...a) => servico().marcarComoLido(...a),
  listarChamados: (...a) => servico().listarChamados(...a),
  buscarChamado: (...a) => servico().buscarChamado(...a),
  contarAbertos: (...a) => servico().contarAbertos(...a),
};
