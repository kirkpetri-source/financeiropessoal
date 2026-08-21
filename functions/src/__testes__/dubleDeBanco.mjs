import { criarEscopo } from '../data/escopo.js';

/**
 * Dublê de Firestore em memória, compartilhado pelos testes dos chamados.
 *
 * Por que existe: cada arquivo de teste do projeto monta o seu próprio fake, e
 * isso funcionou enquanto o fake era `collection().doc().get()`. Os chamados
 * precisam de transação, de sentinela (`arrayUnion`, `increment`) e de
 * `select()` — reescrever isso em cada arquivo novo é onde as cópias começam a
 * divergir e um teste passa a provar coisa diferente do outro.
 *
 * Os testes que já existiam continuam com os fakes deles de propósito: eles são
 * a rede de segurança do isolamento entre famílias, e trocar a fundação deles
 * por esta seria mexer no que protege sem ganhar nada.
 *
 * O QUE ELE NÃO FAZ, e precisa estar escrito: **não reproduz contenção**. A
 * transação aqui aplica a escrita na hora e executa em série, enquanto o
 * Firestore acumula, tenta o commit e REPETE a função inteira quando outra
 * escrita chegou no meio. Então nenhum teste com este dublê prova numeração
 * atômica nem "dois respondendo ao mesmo tempo" de verdade — isso só se prova
 * ponta a ponta, contra homologação. O que ele prova é o contrato: o que é
 * lido, o que é escrito e o que é recusado.
 */

/**
 * Sentinelas são resolvidas pelo servidor do Firestore. Aqui também, senão o
 * teste só consegue afirmar que a escrita foi chamada — e não o efeito dela,
 * que é o que importa em "acrescentar mensagem sem reescrever o array".
 */
function resolverSentinelas(atual, patch) {
  const saida = { ...atual };

  for (const [campo, valor] of Object.entries(patch)) {
    if (valor && valor.__sentinela === 'arrayUnion') {
      const lista = Array.isArray(saida[campo]) ? saida[campo] : [];
      saida[campo] = [...lista, ...valor.itens];
    } else if (valor && valor.__sentinela === 'increment') {
      saida[campo] = (saida[campo] || 0) + valor.quanto;
    } else if (valor && valor.__sentinela === 'delete') {
      delete saida[campo];
    } else {
      saida[campo] = valor;
    }
  }

  return saida;
}

/** Data que se comporta como Timestamp do Firestore o suficiente para o teste. */
function comoTimestamp(data) {
  return {
    _fake: true,
    toDate: () => data,
    toMillis: () => data.getTime(),
  };
}

export function criarDuble(documentosIniciais = {}) {
  const estado = {
    documentos: { ...documentosIniciais },
    filtrosAplicados: [],
    transacoes: 0,
  };

  let contadorDeId = 0;

  function fakeQuery(colecao, filtros = [], projecao = null) {
    return {
      where(campo, op, valor) {
        estado.filtrosAplicados.push({ colecao, campo, op, valor });
        return fakeQuery(colecao, [...filtros, { campo, op, valor }], projecao);
      },
      orderBy() { return fakeQuery(colecao, filtros, projecao); },
      limit(n) {
        const q = fakeQuery(colecao, filtros, projecao);
        const getOriginal = q.get;
        q.get = async () => {
          const snap = await getOriginal();
          const docs = snap.docs.slice(0, n);
          return { docs, empty: docs.length === 0, size: docs.length };
        };
        return q;
      },
      select(...campos) { return fakeQuery(colecao, filtros, campos); },
      async get() {
        const docs = Object.entries(estado.documentos)
          .filter(([chave]) => chave.startsWith(`${colecao}/`))
          .map(([chave, dados]) => ({ id: chave.slice(colecao.length + 1), _dados: dados }))
          .filter((doc) => filtros.every((f) => {
            const v = doc._dados[f.campo];
            if (f.op === '==') return v === f.valor;
            if (f.op === 'in') return Array.isArray(f.valor) && f.valor.includes(v);
            if (f.op === '<=') return v != null && v <= f.valor;
            if (f.op === '>=') return v != null && v >= f.valor;
            return true;
          }))
          .map((doc) => ({
            id: doc.id,
            exists: true,
            data: () => (projecao
              ? Object.fromEntries(projecao.filter((c) => c in doc._dados).map((c) => [c, doc._dados[c]]))
              : doc._dados),
          }));

        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
  }

  function fakeRef(colecao, id) {
    const chave = `${colecao}/${id}`;
    return {
      id,
      _chave: chave,
      async get() {
        const dados = estado.documentos[chave];
        return { exists: !!dados, id, data: () => dados };
      },
      async set(dados, opcoes) {
        estado.documentos[chave] = opcoes?.merge
          ? resolverSentinelas(estado.documentos[chave] || {}, dados)
          : resolverSentinelas({}, dados);
      },
      async update(dados) {
        estado.documentos[chave] = resolverSentinelas(estado.documentos[chave], dados);
      },
      async delete() { delete estado.documentos[chave]; },
      async create(dados) {
        if (estado.documentos[chave]) {
          throw Object.assign(new Error('already exists'), { code: 6 });
        }
        estado.documentos[chave] = resolverSentinelas({}, dados);
      },
    };
  }

  const db = {
    collection(nome) {
      return {
        ...fakeQuery(nome),
        doc(id) { return fakeRef(nome, id || `gerado-${++contadorDeId}`); },
        async add(dados) {
          const id = `gerado-${++contadorDeId}`;
          estado.documentos[`${nome}/${id}`] = dados;
          return {
            id,
            async get() { return { id, data: () => estado.documentos[`${nome}/${id}`] }; },
          };
        },
      };
    },

    async runTransaction(fn) {
      estado.transacoes += 1;
      let leu = false;
      let escreveu = false;

      const tx = {
        async get(ref) {
          // O Firestore recusa leitura depois de escrita na mesma transação.
          // Reproduzir a recusa aqui é o que impede um código com a ordem
          // errada de passar no teste e quebrar só em produção.
          if (escreveu) throw new Error('Transação: leitura depois de escrita não é permitida.');
          leu = true;
          return ref.get();
        },
        create(ref, dados) {
          escreveu = true;
          if (estado.documentos[ref._chave]) {
            throw Object.assign(new Error('already exists'), { code: 6 });
          }
          estado.documentos[ref._chave] = resolverSentinelas({}, dados);
        },
        set(ref, dados, opcoes) {
          escreveu = true;
          estado.documentos[ref._chave] = opcoes?.merge
            ? resolverSentinelas(estado.documentos[ref._chave] || {}, dados)
            : resolverSentinelas({}, dados);
        },
        update(ref, dados) {
          escreveu = true;
          if (!estado.documentos[ref._chave]) throw new Error('documento não existe');
          estado.documentos[ref._chave] = resolverSentinelas(estado.documentos[ref._chave], dados);
        },
      };

      const resultado = await fn(tx);
      void leu;
      return resultado;
    },
  };

  const admin = {
    firestore: {
      FieldValue: {
        serverTimestamp: () => '<agora>',
        arrayUnion: (...itens) => ({ __sentinela: 'arrayUnion', itens }),
        increment: (quanto) => ({ __sentinela: 'increment', quanto }),
        delete: () => ({ __sentinela: 'delete' }),
      },
      Timestamp: {
        fromDate: (d) => comoTimestamp(d),
        now: () => comoTimestamp(new Date()),
      },
    },
  };

  return { db, admin, estado, escopoDe: criarEscopo(db, admin), comoTimestamp };
}
