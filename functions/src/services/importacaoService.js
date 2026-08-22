/**
 * Importação de extrato bancário — a parte que conversa com o banco de dados.
 *
 * O núcleo de leitura (ler OFX/CSV, categorizar, agrupar, analisar risco) vive
 * em `src/importacao/` e é todo função pura. Aqui fica o que tem estado: buscar
 * o que a família já tem, guardar o rascunho, gravar o lote e desfazê-lo.
 *
 * DUAS BARREIRAS CONTRA DUPLICIDADE, uma de produto e uma de banco:
 *
 *   1. Janela retroativa (`importacao/janela.js`): só mês já fechado entra. O
 *      mês corrente — onde os lançamentos por WhatsApp estão acontecendo — nem
 *      chega a ser oferecido. Elimina a sobreposição na origem.
 *   2. ID determinístico: o lançamento importado tem como ID a impressão
 *      digital da linha do banco, então gravar duas vezes é impossível — o
 *      Firestore recusa (`criarComId`). Reimportar o mesmo arquivo, clicar duas
 *      vezes em confirmar, ou reenviar um extrato que se sobrepõe ao anterior
 *      resulta em "puladas", nunca em duplicata.
 *
 * A terceira camada é informativa: linha do extrato que casa em valor e data
 * com um lançamento que já existe (típico do que veio pelo WhatsApp, que não
 * tem digital nenhuma) vem marcada e DESMARCADA na tela. Essa não trava, porque
 * casamento por valor+data é palpite, não fato.
 *
 * O rascunho é gravado no servidor e a confirmação manda só índices: o cliente
 * nunca reenvia valor, data ou descrição. Assim não existe caminho para forjar
 * um lançamento "importado" com dados diferentes do arquivo que o servidor leu.
 */

const { lerExtrato } = require('../importacao/leitorDeExtrato');
const { categorizar } = require('../importacao/categorizador');
const { agrupar, sugerirLotes, memoriaAprendida } = require('../importacao/agrupador');
const { marcarProvaveisDuplicatas, resumirMeses } = require('../importacao/analiseDeMeses');
const { filtrarRetroativas, explicarRecusa, ultimoMesFechado, motivoDeRecusa } = require('../importacao/janela');

/** Prefixo do ID do lançamento importado. Deixa a origem óbvia no console do Firestore. */
const PREFIXO = 'imp';

function idDoLancamento(householdId, digital) {
  return `${PREFIXO}_${householdId}_${digital}`;
}

function normalizarNome(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * Quanto tempo um rascunho não confirmado continua de pé.
 *
 * 24h cobre o caso real de deixar para conferir o extrato no dia seguinte, sem
 * deixar o documento (que carrega o extrato inteiro) parado para sempre.
 */
const VALIDADE_DO_RASCUNHO_MS = 24 * 60 * 60 * 1000;

function criarServicoDeImportacao({ escopoDe, admin, categorizarComIA = null, consumirCreditoDeIA = null }) {
  /**
   * Lê o arquivo e monta o preview, SEM gravar lançamento nenhum. O único
   * documento escrito é o rascunho — que é o que permite confirmar depois sem
   * reenviar o arquivo, e o que impede o cliente de mandar dados próprios na
   * confirmação.
   */
  async function analisar({ householdId, conteudo, nomeArquivo = null, criadoPor = null, agora = new Date() }) {
    const dados = escopoDe(householdId);

    await descartarRascunhosAbandonados(dados, agora);

    const lido = lerExtrato(conteudo);
    const { aceitas, recusadas } = filtrarRetroativas(lido.transacoes, { agora });

    if (!aceitas.length) {
      const motivo = recusadas.length ? recusadas[0].motivoRecusa : null;
      throw Object.assign(
        new Error(motivo
          ? explicarRecusa(motivo, agora)
          : 'Não encontrei lançamentos neste arquivo.'),
        { statusCode: 422, codigo: motivo || 'SEM_LANCAMENTOS' },
      );
    }

    const meses = [...new Set(aceitas.map((t) => String(t.data).slice(0, 7)))];
    const existentes = await lancamentosDosMeses(dados, meses);

    // O que JÁ foi importado antes (mesma digital) é fato, não palpite: some da
    // seleção como "já importado" em vez de virar decisão do usuário.
    const digitaisExistentes = new Set(existentes.map((e) => e.digital).filter(Boolean));

    const historico = await lerMemoria(dados);
    const categorizadas = await categorizar(aceitas, {
      historico,
      resolverComIA: await resolverIA(householdId),
    });

    const comDuplicatas = marcarProvaveisDuplicatas(
      categorizadas,
      existentes.filter((e) => !e.digital), // lançamento importado não é "provável duplicata": é certeza, tratada acima
    );

    const linhas = comDuplicatas.map((t) => ({
      data: t.data,
      valor: t.valor,
      tipo: t.tipo,
      descricao: t.descricao,
      descricaoLimpa: t.descricaoLimpa || t.descricao,
      digital: t.digital,
      chaveDeAprendizado: t.chaveDeAprendizado || null,
      categoriaSugerida: t.categoriaSugerida,
      confianca: t.confianca,
      ehTransferencia: !!t.ehTransferencia,
      jaImportada: digitaisExistentes.has(t.digital),
      provavelDuplicata: t.provavelDuplicata || null,
    }));

    const resumoExistente = resumoPorMes(existentes);

    const rascunho = {
      status: 'rascunho',
      arquivo: { nome: nomeArquivo, formato: lido.formato },
      periodo: lido.periodo,
      criadoPor,
      linhas,
      meses: resumirMeses(linhas.filter((l) => !l.jaImportada), resumoExistente),
      grupos: agrupar(linhas.filter((l) => !l.jaImportada)),
      lotes: sugerirLotes(linhas.filter((l) => !l.jaImportada)),
      recusadas: resumirRecusadas(recusadas, agora),
      jaImportadas: linhas.filter((l) => l.jaImportada).length,
      duplicatasNoArquivo: lido.duplicatasNoArquivo.length,
      ignoradas: lido.ignoradas || 0,
    };

    const criado = await dados.criar('importBatches', rascunho);
    return { id: criado.id, ...rascunho, limiteRetroativo: ultimoMesFechado(agora) };
  }

  /**
   * Grava o lote. `escolhas` traz só índice + categoria: tudo mais vem do
   * rascunho que o servidor leu.
   */
  async function confirmar({ householdId, batchId, escolhas = [], criadoPor = null, agora = new Date() }) {
    const dados = escopoDe(householdId);

    const lote = await dados.buscarDoc('importBatches', batchId);
    if (!lote) throw Object.assign(new Error('Importação não encontrada.'), { statusCode: 404 });
    if (lote.status === 'confirmado') {
      throw Object.assign(new Error('Esta importação já foi confirmada.'), { statusCode: 409, codigo: 'JA_CONFIRMADA' });
    }
    if (lote.status === 'desfeito') {
      throw Object.assign(new Error('Esta importação foi desfeita. Envie o arquivo de novo.'), { statusCode: 409 });
    }
    if (!escolhas.length) {
      throw Object.assign(new Error('Nenhum lançamento selecionado.'), { statusCode: 400 });
    }

    const categorias = await carregarCategorias(dados);

    const criadas = [];
    const puladas = [];
    const aprendidas = [];

    for (const escolha of escolhas) {
      const linha = lote.linhas[escolha.indice];
      if (!linha) continue;

      // Segunda barreira da janela: o rascunho pode ter atravessado a virada do
      // mês, e a regra vale no momento da GRAVAÇÃO, não no da leitura.
      const recusa = motivoDeRecusa(linha.data, agora);
      if (recusa) {
        puladas.push({ indice: escolha.indice, motivo: recusa });
        continue;
      }
      if (linha.jaImportada) {
        puladas.push({ indice: escolha.indice, motivo: 'JA_IMPORTADA' });
        continue;
      }

      const nomeCategoria = escolha.categoria || linha.categoriaSugerida || 'Outros';
      const categoria = acharCategoria(categorias, nomeCategoria, linha.tipo);
      if (!categoria) {
        puladas.push({ indice: escolha.indice, motivo: 'CATEGORIA_DESCONHECIDA' });
        continue;
      }

      const resultado = await dados.criarComId(
        'transactions',
        idDoLancamento(householdId, linha.digital),
        {
          type: linha.tipo,
          description: linha.descricaoLimpa || linha.descricao,
          amount: Number(linha.valor),
          categoryId: categoria.id,
          subcategoryId: null,
          paymentMethodId: null,
          date: admin.firestore.Timestamp.fromDate(new Date(`${linha.data}T12:00:00Z`)),
          referenceMonth: String(linha.data).slice(0, 7),
          notes: `Importado do extrato${lote.arquivo?.nome ? ` (${lote.arquivo.nome})` : ''}`,
          origin: 'IMPORT',
          status: 'CONFIRMED',
          paidBy: null,
          createdBy: criadoPor,
          // Rastro da importação: `digital` é o que impede a mesma linha de
          // entrar de novo; `importId` é o que permite desfazer o lote inteiro.
          digital: linha.digital,
          importId: batchId,
          descricaoOriginal: linha.descricao,
        },
      );

      if (resultado.criado) {
        criadas.push(escolha.indice);
        if (escolha.categoria && linha.chaveDeAprendizado) {
          aprendidas.push({ ...linha, categoriaSugerida: nomeCategoria, confianca: 'usuario' });
        }
      } else {
        // O Firestore recusou: já existe lançamento com esta digital. É a trava
        // funcionando, não um erro — acontece em reimportação e em duplo clique.
        puladas.push({ indice: escolha.indice, motivo: 'JA_EXISTE' });
      }
    }

    await gravarMemoria(dados, aprendidas);

    await dados.atualizar('importBatches', batchId, {
      status: 'confirmado',
      confirmadoEm: admin.firestore.FieldValue.serverTimestamp(),
      totalCriadas: criadas.length,
      totalPuladas: puladas.length,
      puladas,
    });

    return { batchId, totalCriadas: criadas.length, totalPuladas: puladas.length, puladas };
  }

  /**
   * Desfaz a importação inteira. Existe porque é o que torna a decisão de
   * importar reversível — e decisão reversível é o que permite a pessoa tentar
   * sem medo. Só apaga o que ESTE lote criou (`importId`), nunca lançamento
   * feito à mão ou pelo WhatsApp.
   */
  async function desfazer({ householdId, batchId }) {
    const dados = escopoDe(householdId);

    const lote = await dados.buscarDoc('importBatches', batchId);
    if (!lote) throw Object.assign(new Error('Importação não encontrada.'), { statusCode: 404 });
    if (lote.status !== 'confirmado') {
      throw Object.assign(new Error('Só dá para desfazer uma importação confirmada.'), { statusCode: 409 });
    }

    const snap = await dados.consultar('transactions').where('importId', '==', batchId).get();

    let apagadas = 0;
    for (const doc of snap.docs) {
      await dados.remover('transactions', doc.id);
      apagadas += 1;
    }

    await dados.atualizar('importBatches', batchId, {
      status: 'desfeito',
      desfeitoEm: admin.firestore.FieldValue.serverTimestamp(),
      totalApagadas: apagadas,
    });

    return { batchId, apagadas };
  }

  async function listarLotes({ householdId, limite = 20 }) {
    const dados = escopoDe(householdId);
    const snap = await dados.consultar('importBatches').get();

    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      // Sem orderBy de propósito (regra do projeto): `where` + `orderBy` em
      // campos diferentes exigiria índice composto, e são dezenas de lotes por
      // família no pior caso.
      .map(({ linhas, grupos, lotes, ...resto }) => ({
        ...resto,
        totalLinhas: linhas?.length || 0,
        createdAt: resto.createdAt?.toDate?.()?.toISOString() || null,
        confirmadoEm: resto.confirmadoEm?.toDate?.()?.toISOString() || null,
        desfeitoEm: resto.desfeitoEm?.toDate?.()?.toISOString() || null,
      }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, limite);
  }

  async function buscarLote({ householdId, batchId }) {
    const dados = escopoDe(householdId);
    const lote = await dados.buscarDoc('importBatches', batchId);
    if (!lote) throw Object.assign(new Error('Importação não encontrada.'), { statusCode: 404 });
    return lote;
  }

  // ---------------------------------------------------------------- internos

  /**
   * Apaga rascunhos que a família começou e nunca terminou.
   *
   * Rascunho é uma etapa, não um registro: ele existe entre o "subi o arquivo"
   * e o "confirmei". Quem fecha a aba no meio deixa para trás um documento com
   * o extrato bancário INTEIRO dentro (50 linhas de dado financeiro, com nome
   * de contraparte e conta), que nunca vira lançamento e nunca some sozinho.
   *
   * Dois problemas de uma vez: a tela de importações passa a listar
   * "Não concluída" para sempre, sem nenhum jeito de a pessoa limpar; e o
   * sistema guarda dado pessoal que já não tem finalidade, que é exatamente o
   * que a LGPD manda não fazer.
   *
   * A limpeza é aqui, no começo de uma importação NOVA, e não numa rotina
   * agendada, por dois motivos: começar outra importação é a prova de que a
   * anterior foi abandonada (a agendada teria que adivinhar), e uma varredura
   * diária precisaria varrer todas as famílias — leitura cross-tenant e mais
   * uma agendada para vigiar, para resolver um caso que acontece raramente.
   *
   * A janela de 24h protege quem deixou a aba aberta e volta para confirmar
   * mais tarde: esse rascunho continua válido enquanto a pessoa não recomeçar.
   * Falha aqui nunca derruba a importação — limpeza é higiene, não requisito.
   */
  async function descartarRascunhosAbandonados(dados, agora) {
    const limite = new Date(agora.getTime() - VALIDADE_DO_RASCUNHO_MS);

    try {
      const snap = await dados.consultar('importBatches').where('status', '==', 'rascunho').get();

      for (const doc of snap.docs) {
        const criadoEm = doc.data()?.createdAt?.toDate?.();
        if (criadoEm && criadoEm > limite) continue;
        await dados.remover('importBatches', doc.id);
      }
    } catch (err) {
      console.error('[Importação] Falhou ao limpar rascunhos antigos:', err.message);
    }
  }

  /** Uma query por mês: igualdade simples, sem exigir índice composto novo. */
  async function lancamentosDosMeses(dados, meses) {
    const tudo = [];
    for (const mes of meses) {
      const snap = await dados.consultar('transactions').where('referenceMonth', '==', mes).get();
      for (const doc of snap.docs) {
        const d = doc.data();
        tudo.push({
          id: doc.id,
          amount: d.amount,
          type: d.type,
          description: d.description,
          origin: d.origin,
          digital: d.digital || null,
          date: d.date?.toDate?.()?.toISOString?.().slice(0, 10) || d.date,
          referenceMonth: d.referenceMonth,
        });
      }
    }
    return tudo;
  }

  function resumoPorMes(existentes) {
    const resumo = {};
    for (const e of existentes) {
      const mes = e.referenceMonth || String(e.date || '').slice(0, 7);
      if (!resumo[mes]) resumo[mes] = { quantidade: 0, totalGastos: 0 };
      resumo[mes].quantidade += 1;
      if (e.type === 'EXPENSE') resumo[mes].totalGastos += Number(e.amount) || 0;
    }
    return resumo;
  }

  function resumirRecusadas(recusadas, agora) {
    if (!recusadas.length) return null;
    const porMotivo = {};
    for (const r of recusadas) porMotivo[r.motivoRecusa] = (porMotivo[r.motivoRecusa] || 0) + 1;

    return {
      total: recusadas.length,
      porMotivo,
      explicacao: explicarRecusa(recusadas[0].motivoRecusa, agora),
      limiteRetroativo: ultimoMesFechado(agora),
    };
  }

  /**
   * IA só entra se estiver disponível E dentro do teto diário da família. Uma
   * importação gasta UMA chamada (as descrições vão todas juntas), então o
   * custo é o mesmo de uma mensagem de WhatsApp mal resolvida.
   */
  async function resolverIA(householdId) {
    if (!categorizarComIA) return null;
    if (consumirCreditoDeIA) {
      const liberado = await consumirCreditoDeIA(householdId);
      if (!liberado) return null;
    }
    return categorizarComIA;
  }

  async function lerMemoria(dados) {
    const doc = await dados.docDaFamilia('importMemoria').get();
    return doc.exists ? (doc.data().mapa || {}) : {};
  }

  async function gravarMemoria(dados, transacoes) {
    const novo = memoriaAprendida(transacoes);
    if (!Object.keys(novo).length) return;

    const ref = dados.docDaFamilia('importMemoria');
    const atual = await ref.get();
    const mapa = { ...(atual.exists ? atual.data().mapa : {}), ...novo };

    await ref.set({
      householdId: dados.householdId,
      mapa,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  async function carregarCategorias(dados) {
    const [proprias, padroes] = await Promise.all([
      dados.consultar('categories').get(),
      dados.consultarPadroes('categories').get(),
    ]);

    return [...proprias.docs, ...padroes.docs].map((d) => ({ id: d.id, ...d.data() }));
  }

  function acharCategoria(categorias, nome, tipo) {
    const alvo = normalizarNome(nome);
    const doTipo = categorias.filter((c) => !c.type || c.type === tipo);

    return doTipo.find((c) => normalizarNome(c.name) === alvo)
      || doTipo.find((c) => normalizarNome(c.name) === 'outros')
      || null;
  }

  return { analisar, confirmar, desfazer, listarLotes, buscarLote };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { admin } = require('../config/firebaseAdmin');
    const { escopoDe } = require('../data/escopo');
    const { categorizarDescricoesEmLote } = require('./aiParserService');
    const { verificarLimiteDeIA } = require('./limiteIAService');

    _padrao = criarServicoDeImportacao({
      escopoDe,
      admin,
      categorizarComIA: categorizarDescricoesEmLote,
      consumirCreditoDeIA: async (householdId) => {
        try {
          // Devolve booleano e já consome a chamada na mesma transação.
          return await verificarLimiteDeIA(householdId);
        } catch {
          // Teto indisponível não pode travar a importação: segue sem IA.
          return false;
        }
      },
    });
  }
  return _padrao;
}

module.exports = {
  criarServicoDeImportacao,
  idDoLancamento,
  servico,
  analisar: (...args) => servico().analisar(...args),
  confirmar: (...args) => servico().confirmar(...args),
  desfazer: (...args) => servico().desfazer(...args),
  listarLotes: (...args) => servico().listarLotes(...args),
  buscarLote: (...args) => servico().buscarLote(...args),
};
