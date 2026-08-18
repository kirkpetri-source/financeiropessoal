const { normalizar } = require('../utils/normalizarTexto');

/**
 * As ações que a assistente pode EXECUTAR — registrar, alterar e apagar
 * lançamento.
 *
 * Separado das consultas (consultaFinanceiraService) porque a natureza é outra:
 * consulta errada devolve um número errado na tela, ação errada muda o dinheiro
 * registrado da família. Manter os dois em arquivos diferentes deixa óbvio, na
 * revisão, o que é leitura e o que é escrita.
 *
 * TRÊS REGRAS QUE SUSTENTAM A SEGURANÇA DISTO:
 *
 * 1. **Registrar DELEGA para o fluxo que já existe.** A assistente não grava
 *    lançamento por conta própria: ela devolve o texto para
 *    `lancarPorTexto`, o mesmo caminho do WhatsApp, já testado e com todas as
 *    validações. Não passa a existir um segundo jeito de gravar dinheiro no
 *    sistema — existe um só, e a IA é mais uma porta até ele.
 *
 * 2. **Alterar e apagar são de DUAS ETAPAS.** A assistente propõe, o cliente
 *    confirma, e só então executa. A pendência mora no servidor, não na
 *    memória do modelo: sem ela gravada, `confirmarAcaoPendente` recusa. Ou
 *    seja, a IA não consegue executar uma alteração que ela não propôs antes —
 *    nem se decidir chamar a ferramenta de confirmação direto.
 *
 * 3. **Sempre um registro por vez.** Não existe ferramenta que altere ou apague
 *    em lote. "Apaga tudo" é impossível por ausência de capacidade, e não por
 *    uma recusa que um prompt bem escrito poderia contornar.
 *
 * Tudo aqui exige a permissão `lancar` — um `viewer` não consegue, pedindo à
 * assistente, o que o painel não deixa ele fazer no botão.
 */

// Depois disso a proposta é considerada esquecida. Curto: confirmar uma
// alteração que você propôs meia hora atrás é confirmar no escuro.
const MINUTOS_DE_VALIDADE = 10;

const CAMPOS_ALTERAVEIS = ['categoria', 'subcategoria', 'valor', 'descricao'];

function moeda(valor) {
  return `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function criarAcoesFinanceiras({
  transactionService,
  categoryService,
  subcategoryService,
  lancarPorTexto,
  sessoes,
  agora = () => new Date(),
}) {
  /**
   * Acha o lançamento de que a pessoa está falando.
   *
   * Sem referência, é o mais recente — que é o caso esmagadoramente comum
   * ("muda a categoria disso aí"). Com referência, casa por trecho da
   * descrição. Achou mais de um? Devolve os candidatos em vez de escolher: a
   * assistente pergunta qual, porque adivinhar aqui altera o lançamento errado.
   */
  async function localizar(dados, referencia) {
    const mes = (agora().toISOString()).slice(0, 7);
    const lista = await transactionService.listTransactions(dados, { month: mes });

    if (!lista.length) return { erro: 'Não há lançamentos neste mês.' };

    if (!referencia) return { alvo: lista[0] };

    const busca = normalizar(referencia);
    const casaram = lista.filter((t) => normalizar(t.description || '').includes(busca));

    if (!casaram.length) {
      return { erro: `Não encontrei nenhum lançamento com "${referencia}" neste mês.` };
    }

    if (casaram.length > 1) {
      return {
        ambiguo: casaram.slice(0, 5).map((t) => ({
          descricao: t.description,
          valor: t.amount,
          data: t.date instanceof Date ? t.date.toISOString().slice(0, 10) : String(t.date).slice(0, 10),
          categoria: t.category?.name || null,
        })),
      };
    }

    return { alvo: casaram[0] };
  }

  /**
   * Registra um lançamento novo.
   *
   * Não confirma antes, e isso é deliberado: criar já funciona assim no
   * WhatsApp desde sempre, o lançamento aparece na lista, e desfazer é uma
   * mensagem. Pedir confirmação aqui seria atrito sem ganho.
   */
  async function registrarLancamento(dados, { texto } = {}) {
    if (!texto || !String(texto).trim()) {
      return { erro: 'Preciso saber o que registrar. Ex.: "gastei 84,90 no mercado".' };
    }

    const r = await lancarPorTexto({
      householdId: dados.householdId,
      texto: String(texto).trim(),
      dataDaMensagem: agora(),
      origin: 'CHAT',
      origem: 'chat',
    });

    if (r.erro) return { erro: r.erro };

    return {
      registrados: (r.criadas || []).map((t) => ({
        descricao: t.description,
        valor: t.amount,
        tipo: t.type,
        categoria: t.category?.name || null,
        subcategoria: t.subcategory?.name || null,
      })),
    };
  }

  async function guardarPendencia(dados, interlocutor, pendencia) {
    await sessoes.definirAcaoPendente(dados, interlocutor, {
      ...pendencia,
      expiraEm: new Date(agora().getTime() + MINUTOS_DE_VALIDADE * 60000).toISOString(),
    });
  }

  /**
   * Propõe uma alteração. NÃO altera nada — só descreve o que aconteceria e
   * guarda a proposta para a confirmação seguinte.
   */
  async function prepararAlteracao(dados, args = {}, ctx = {}) {
    const { lancamento, campo, novoValor } = args;

    if (!CAMPOS_ALTERAVEIS.includes(String(campo))) {
      return { erro: `Só sei alterar: ${CAMPOS_ALTERAVEIS.join(', ')}.` };
    }
    if (novoValor === undefined || novoValor === null || String(novoValor).trim() === '') {
      return { erro: 'Preciso saber para o quê alterar.' };
    }

    const achado = await localizar(dados, lancamento);
    if (achado.erro) return { erro: achado.erro };
    if (achado.ambiguo) return { precisaEscolher: achado.ambiguo };

    const alvo = achado.alvo;
    const alteracao = {};
    let de;
    let para;

    if (campo === 'categoria') {
      const categorias = await categoryService.listCategories(dados);
      const nova = categorias.find((c) => normalizar(c.name) === normalizar(novoValor));
      if (!nova) return { erro: `Não existe a categoria "${novoValor}". Crie no painel antes.` };
      alteracao.categoryId = nova.id;
      // Categoria nova invalida a subcategoria antiga: ela pertencia à outra.
      alteracao.subcategoryId = null;
      de = alvo.category?.name || '(sem categoria)';
      para = nova.name;
    }

    if (campo === 'subcategoria') {
      const subs = await subcategoryService.listSubcategories(dados, alvo.categoryId);
      const nova = subs.find((s) => normalizar(s.name) === normalizar(novoValor));
      if (!nova) {
        return {
          erro: `"${novoValor}" não é subcategoria de ${alvo.category?.name || 'dessa categoria'}.`,
          opcoes: subs.map((s) => s.name),
        };
      }
      alteracao.subcategoryId = nova.id;
      de = alvo.subcategory?.name || '(sem subcategoria)';
      para = nova.name;
    }

    if (campo === 'valor') {
      const numero = Number(String(novoValor).replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(numero) || numero <= 0) return { erro: 'Valor inválido.' };
      alteracao.amount = numero;
      de = moeda(alvo.amount);
      para = moeda(numero);
    }

    if (campo === 'descricao') {
      alteracao.description = String(novoValor).trim();
      de = alvo.description;
      para = alteracao.description;
    }

    await guardarPendencia(dados, ctx.interlocutor, {
      tipo: 'ALTERAR',
      transactionId: alvo.id,
      alteracao,
      resumo: { descricao: alvo.description, valor: alvo.amount, campo, de, para },
    });

    return {
      precisaConfirmar: true,
      oQueVaiMudar: {
        lancamento: `${alvo.description} — ${moeda(alvo.amount)}`,
        campo,
        de,
        para,
      },
    };
  }

  /** Propõe apagar. Não apaga — guarda a proposta e devolve o que sumiria. */
  async function prepararExclusao(dados, args = {}, ctx = {}) {
    const achado = await localizar(dados, args.lancamento);
    if (achado.erro) return { erro: achado.erro };
    if (achado.ambiguo) return { precisaEscolher: achado.ambiguo };

    const alvo = achado.alvo;

    await guardarPendencia(dados, ctx.interlocutor, {
      tipo: 'APAGAR',
      transactionId: alvo.id,
      resumo: { descricao: alvo.description, valor: alvo.amount },
    });

    return {
      precisaConfirmar: true,
      oQueVaiSerApagado: {
        lancamento: `${alvo.description} — ${moeda(alvo.amount)}`,
        categoria: alvo.category?.name || null,
      },
    };
  }

  /**
   * Executa o que foi proposto. Só isto escreve.
   *
   * Sem pendência gravada, recusa — é o que impede a assistente de executar uma
   * alteração que ela não propôs, mesmo que decida chamar esta ferramenta
   * sozinha.
   */
  async function confirmarAcaoPendente(dados, _args = {}, ctx = {}) {
    const pendente = await sessoes.lerAcaoPendente(dados, ctx.interlocutor);

    if (!pendente) {
      return { erro: 'Não há nenhuma alteração esperando confirmação. Diga o que você quer mudar.' };
    }

    if (pendente.expiraEm && new Date(pendente.expiraEm) <= agora()) {
      await sessoes.limparAcaoPendente(dados, ctx.interlocutor);
      return { erro: 'A confirmação expirou. Pode pedir de novo?' };
    }

    await sessoes.limparAcaoPendente(dados, ctx.interlocutor);

    if (pendente.tipo === 'ALTERAR') {
      await transactionService.updateTransaction(dados, pendente.transactionId, pendente.alteracao);
      return { feito: 'ALTERADO', resumo: pendente.resumo };
    }

    if (pendente.tipo === 'APAGAR') {
      await transactionService.deleteTransaction(dados, pendente.transactionId);
      return { feito: 'APAGADO', resumo: pendente.resumo };
    }

    return { erro: 'Não entendi o que era para confirmar.' };
  }

  /** Desiste da proposta. */
  async function cancelarAcaoPendente(dados, _args = {}, ctx = {}) {
    const pendente = await sessoes.lerAcaoPendente(dados, ctx.interlocutor);
    if (!pendente) return { nadaParaCancelar: true };

    await sessoes.limparAcaoPendente(dados, ctx.interlocutor);
    return { cancelado: true, resumo: pendente.resumo };
  }

  return {
    registrarLancamento,
    prepararAlteracao,
    prepararExclusao,
    confirmarAcaoPendente,
    cancelarAcaoPendente,
    localizar,
  };
}

module.exports = { criarAcoesFinanceiras, MINUTOS_DE_VALIDADE, CAMPOS_ALTERAVEIS };
