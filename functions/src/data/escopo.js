/**
 * Isolamento entre famílias (multi-tenancy).
 *
 * Num sistema pago com dados financeiros, o erro que mata o produto não é
 * cair — é a família A enxergar o gasto da família B. E esse erro nasce sempre
 * do mesmo jeito: alguém escreve uma query e esquece o filtro do tenant.
 *
 * Aqui a query sem tenant não compila na prática: não existe caminho para
 * acessar as coleções escopadas sem passar um householdId. Quem tenta usar o
 * `db` cru nos services está contornando a proteção de propósito, e isso é
 * visível na revisão de código.
 *
 * Uso:
 *   const dados = escopoDe(householdId);
 *   const snap = await dados.consultar('transactions').where('type','==','EXPENSE').get();
 *   const doc  = await dados.buscarDoc('transactions', id);   // null se for de outra família
 *   await dados.criar('transactions', { ... });               // carimba householdId
 */

// Coleções que pertencem a uma família e nunca podem ser lidas sem escopo.
const COLECOES_ESCOPADAS = new Set([
  'transactions',
  'whatsappLogs',
  'budgets',
  'recurringBills',
  'creditCardInvoices',
  'subcategories',
  'pendingSubcategoryConfirmations',
  // Importação de extrato: o lote (para poder desfazer) e a memória de
  // contraparte -> categoria que a família ensina ao classificar.
  'importBatches',
  'importMemoria',
  // Consultor de IA: memória curta da conversa, uma por família + interlocutor.
  // Guarda texto financeiro em linguagem natural, então entra no export e no
  // apagar da LGPD junto com o resto.
  'chatSessions',
  // Chamados de suporte, com as mensagens dentro do próprio documento. Guarda
  // o que a família escreveu e a lista de anexos (print de extrato, comprovante),
  // então entra no export e no apagar da LGPD.
  'supportTickets',
  // O que a família ensinou sobre uma descrição de gasto: quantas vezes ela
  // apareceu, a subcategoria aprendida e a recusa de sugerir. Guarda descrição
  // de gasto, então entra no export e no apagar da LGPD.
  'memoriaDeDescricao',
]);

// Coleções que misturam registros globais (isDefault) com registros da família.
// A leitura junta os dois; a escrita sempre carimba o householdId.
const COLECOES_MISTAS = new Set([
  'categories',
  'paymentMethods',
]);

const CAMPO = 'householdId';

class ErroDeEscopo extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroDeEscopo';
    this.statusCode = 500;
  }
}

function validarColecao(nome) {
  if (!COLECOES_ESCOPADAS.has(nome) && !COLECOES_MISTAS.has(nome)) {
    throw new ErroDeEscopo(
      `Coleção "${nome}" não está declarada em escopo.js. ` +
      'Declare se ela pertence a uma família antes de usá-la.'
    );
  }
}

/**
 * Fábrica do acessor, com o banco injetado.
 *
 * O banco entra por parâmetro em vez de ser importado aqui dentro para que o
 * teste passe um dublê sem depender de mock de módulo. Mock que silenciosamente
 * não pega faz o teste usar o banco de produção — foi assim que quatro
 * documentos falsos foram parar na coleção transactions.
 */
function criarEscopo(db, admin) {
  return function escopoDe(householdId) {
    if (!householdId || typeof householdId !== 'string' || !householdId.trim()) {
      throw new ErroDeEscopo('householdId ausente — acesso a dados negado.');
    }

    return {
      householdId,

      /**
       * Query já filtrada pela família. Encadeie .where()/.orderBy() normalmente:
       * o filtro do tenant já está aplicado e não há como removê-lo.
       */
      consultar(colecao) {
        validarColecao(colecao);
        return db.collection(colecao).where(CAMPO, '==', householdId);
      },

      /**
       * Registros globais de referência (categorias e formas de pagamento padrão),
       * que não pertencem a nenhuma família. Só existe para as coleções mistas.
       */
      consultarPadroes(colecao) {
        if (!COLECOES_MISTAS.has(colecao)) {
          throw new ErroDeEscopo(`Coleção "${colecao}" não tem registros padrão.`);
        }
        return db.collection(colecao).where('isDefault', '==', true);
      },

      /**
       * Busca por ID conferindo a dona do documento.
       * Devolve null quando não existe OU quando é de outra família — de fora,
       * os dois casos são indistinguíveis, então ninguém descobre a existência
       * de um registro alheio sondando IDs.
       */
      async buscarDoc(colecao, id) {
        validarColecao(colecao);
        if (!id) return null;

        const doc = await db.collection(colecao).doc(id).get();
        if (!doc.exists) return null;

        const dados = doc.data();

        // Registro global de referência: leitura liberada, escrita não.
        if (COLECOES_MISTAS.has(colecao) && dados.isDefault === true) {
          return { id: doc.id, ...dados, _somenteLeitura: true };
        }

        if (dados[CAMPO] !== householdId) {
          console.warn(`[Escopo] Acesso negado: ${colecao}/${id} pertence a outra família.`);
          return null;
        }

        return { id: doc.id, ...dados };
      },

      async criar(colecao, dados) {
        validarColecao(colecao);
        const ref = await db.collection(colecao).add({
          ...dados,
          [CAMPO]: householdId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        const doc = await ref.get();
        return { id: doc.id, ...doc.data() };
      },

      /**
       * Cria com ID escolhido por quem chama, e NÃO sobrescreve se o ID já
       * existir. É o que dá idempotência de verdade a uma escrita.
       *
       * Existe para a importação de extrato: o ID do lançamento importado é
       * derivado da impressão digital da linha do banco, então reimportar o
       * mesmo arquivo — de propósito, por engano, ou por dois cliques no botão
       * — encontra o documento já lá e não duplica. A trava fica no Firestore,
       * e não numa conferência da aplicação, porque conferência tem janela de
       * corrida entre o "já existe?" e o "grava"; `create()` não tem.
       *
       * Duplicata aqui é caminho esperado, não erro: devolve `criado: false`
       * em vez de lançar, para o chamador conseguir contar quantas linhas
       * foram puladas.
       */
      async criarComId(colecao, id, dados) {
        validarColecao(colecao);
        if (!id) throw new ErroDeEscopo('ID obrigatório em criarComId.');

        try {
          await db.collection(colecao).doc(id).create({
            ...dados,
            [CAMPO]: householdId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          return { id, criado: true };
        } catch (err) {
          // 6 = ALREADY_EXISTS no gRPC do Firestore.
          if (err.code === 6 || /already exists/i.test(err.message || '')) {
            return { id, criado: false, motivo: 'JA_EXISTE' };
          }
          throw err;
        }
      },

      /**
       * Cria DENTRO de uma transação que quem chama já abriu.
       *
       * Existe porque `criar` usa `add()`, que é uma escrita independente e não
       * participa de transação nenhuma. O chamado de suporte precisa nascer na
       * MESMA transação que incrementa `counters/supportTickets`: número
       * consumido sem chamado criado deixa um buraco na numeração que ninguém
       * consegue explicar depois, e chamado sem número não tem como ser citado.
       *
       * Sem este método, a alternativa seria o service escrever com `db` cru —
       * a primeira escrita de coleção escopada fora da barreira, no sistema
       * inteiro. O carimbo do householdId aqui é o que impede isso.
       *
       * Síncrono de propósito: `tx.create` do Firestore não devolve promessa;
       * a escrita só acontece no commit da transação.
       */
      criarEmTransacao(tx, colecao, ref, dados) {
        validarColecao(colecao);
        if (!ref) throw new ErroDeEscopo('Referência obrigatória em criarEmTransacao.');

        // A ordem do spread é a proteção: householdId enviado de fora é
        // sobrescrito, nunca respeitado. Mesmo contrato de `criar`.
        tx.create(ref, {
          ...dados,
          [CAMPO]: householdId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { id: ref.id };
      },

      /**
       * Atualiza conferindo a dona antes. Lança 404 quando o documento não é da
       * família — mesma mensagem de "não encontrado", para não vazar existência.
       */
      async atualizar(colecao, id, dados) {
        const atual = await this.buscarDoc(colecao, id);
        if (!atual || atual._somenteLeitura) {
          throw Object.assign(new Error('Registro não encontrado.'), { statusCode: 404 });
        }

        // householdId nunca é alterável pela aplicação — mover registro de família
        // é operação de migração, não de uso normal.
        const { [CAMPO]: _ignorado, ...limpo } = dados;

        await db.collection(colecao).doc(id).update({
          ...limpo,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const doc = await db.collection(colecao).doc(id).get();
        return { id: doc.id, ...doc.data() };
      },

      /**
       * Escrita ATÔMICA, com a conferência de dono DENTRO da transação.
       *
       * `atualizar` faz ler-depois-escrever em duas viagens: entre a leitura e
       * a gravação cabe a escrita de outra pessoa, e quem chegar por último
       * apaga o trabalho do primeiro. Num chamado de suporte isso é o caso
       * comum, não a exceção — cliente e operador respondendo quase juntos —, e
       * o que se perde é mensagem.
       *
       * Aqui `montarPatch` recebe o documento COMO ELE ESTÁ e devolve o que
       * mudar; tudo dentro da mesma transação, então a decisão ("qual o próximo
       * status?") é tomada sobre o estado real e não sobre um estado lido
       * segundos antes. Devolver `null` cancela a escrita sem erro.
       *
       * O patch aceita sentinela (`arrayUnion`, `increment`) — é o que permite
       * acrescentar uma mensagem sem nunca reescrever o array inteiro.
       *
       * Devolve o documento COMO ERA ANTES do patch. Montar um "depois" aqui
       * seria chute: sentinela é resolvida no servidor, e o valor final só
       * existe depois do commit. Quem precisa do estado novo relê.
       */
      async atualizarAtomico(colecao, id, montarPatch) {
        validarColecao(colecao);
        if (!id) throw new ErroDeEscopo('ID obrigatório em atualizarAtomico.');

        const ref = db.collection(colecao).doc(id);
        const naoEncontrado = () => Object.assign(
          new Error('Registro não encontrado.'), { statusCode: 404 }
        );

        return db.runTransaction(async (tx) => {
          const doc = await tx.get(ref);
          if (!doc.exists) throw naoEncontrado();

          const dados = doc.data();

          // Registro global de referência: leitura liberada, escrita não.
          if (COLECOES_MISTAS.has(colecao) && dados.isDefault === true) throw naoEncontrado();

          if (dados[CAMPO] !== householdId) {
            console.warn(`[Escopo] Acesso negado: ${colecao}/${id} pertence a outra família.`);
            throw naoEncontrado();
          }

          const anterior = { id: doc.id, ...dados };
          const patch = typeof montarPatch === 'function' ? montarPatch(anterior) : montarPatch;

          // Nada a fazer é um resultado legítimo, não um erro: "responder a um
          // chamado que já está nesse estado" não deve escrever nem carimbar
          // updatedAt.
          if (!patch) return anterior;

          const { [CAMPO]: _ignorado, ...limpo } = patch;

          tx.update(ref, {
            ...limpo,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          return anterior;
        });
      },

      async remover(colecao, id) {
        const atual = await this.buscarDoc(colecao, id);
        if (!atual || atual._somenteLeitura) {
          throw Object.assign(new Error('Registro não encontrado.'), { statusCode: 404 });
        }
        await db.collection(colecao).doc(id).delete();
      },

      /** Documento único por família, com o householdId como ID (ex.: whatsappConfigs). */
      docDaFamilia(colecao) {
        return db.collection(colecao).doc(householdId);
      },
    };
  };
}

// Acessor de produção, ligado ao Firestore real. O require fica aqui embaixo,
// e não no topo, para que quem importa só a fábrica (os testes) não arraste a
// conexão real junto.
let _escopoDePadrao = null;
function escopoDe(householdId) {
  if (!_escopoDePadrao) {
    const { admin, db } = require('../config/firebaseAdmin');
    _escopoDePadrao = criarEscopo(db, admin);
  }
  return _escopoDePadrao(householdId);
}

module.exports = { criarEscopo, escopoDe, ErroDeEscopo, COLECOES_ESCOPADAS, COLECOES_MISTAS, CAMPO };
