const { rotearConsulta, INTENCAO } = require('../utils/roteadorDeConsulta');

/**
 * Responde pergunta de CONSULTA sem chamar modelo de linguagem nenhum.
 *
 * O número sai das mesmas funções de agregação que a IA usaria
 * (`consultaFinanceiraService`) — não há agregação nova aqui, e não há número
 * calculado por modelo. Isso resolve de uma vez duas coisas que eram
 * problema separado:
 *
 * 1. **Custo.** Medido: 96,5% do que se pagava por pergunta era estrutura
 *    fixa (instrução + catálogo de ferramentas) reenviada a cada rodada.
 *    Consulta respondida aqui custa ZERO.
 * 2. **Exatidão.** A propriedade declarada do projeto é "a IA nunca calcula",
 *    e ela já foi flagrada fazendo conta em produção (multiplicou para
 *    responder "quanto é 15% do mercado"). Aqui o número vem do banco.
 *
 * De quebra, a resposta sai em menos de um segundo em vez de ~6.
 *
 * QUANDO ESTE SERVIÇO NÃO RESPONDE, ELE DIZ QUE NÃO RESPONDE. `responder`
 * devolve `null` e quem chamou segue para a IA exatamente como antes — é o
 * que garante que nada regride. Conselho, aritmética e recorte de tempo que
 * as agregações não fazem (semana, dia) caem sempre para a IA.
 */

/** R$ no formato brasileiro. */
function moeda(valor) {
  return `R$ ${Number(valor || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

const NOMES_DOS_MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** "2026-08" -> "agosto de 2026" */
function mesPorExtenso(mes) {
  const [ano, m] = String(mes || '').split('-');
  const nome = NOMES_DOS_MESES[Number(m) - 1];
  return nome ? `${nome} de ${ano}` : mes;
}

/**
 * Negrito no formato do canal.
 *
 * O WhatsApp usa UM asterisco; o painel renderiza markdown, com dois. Mandar
 * markdown para o WhatsApp faz a pessoa ler "**R$ 300,00**" com os asteriscos
 * na cara — é a mesma correção que o prompt da IA já carrega.
 */
function negrito(texto, canal) {
  return canal === 'WHATSAPP' ? `*${texto}*` : `**${texto}**`;
}

function criarConsultaDireta({ consulta }) {
  /**
   * Tenta responder sem IA.
   *
   * @returns {{texto: string, intencao: string, consultasUsadas: string[]}|null}
   *   `null` quando a pergunta não é de consulta — quem chamou segue para a IA.
   */
  async function responder({ dados, pergunta, canal = 'PAINEL', nomeDaIA = 'Nina', mesCorrente }) {
    const texto = String(pergunta || '').trim();
    if (!texto) return null;

    // O vocabulário vem do banco, então "categoria" aqui é sempre uma categoria
    // que a família REALMENTE tem — nunca uma lista fixa que envelhece.
    const vocabulario = await consulta.montarVocabulario(dados);
    const categorias = vocabulario.map((v) => v.categoria);

    const rota = rotearConsulta(texto, { categorias, mesCorrente, nomeDaIA });
    if (!rota) return null;

    const { intencao, parametros } = rota;

    switch (intencao) {
      case INTENCAO.IDENTIDADE:
        return {
          intencao,
          consultasUsadas: [],
          texto: `Eu me chamo ${negrito(parametros.nomeDaIA, canal)}. Sou a assistente `
            + 'financeira da sua família — cuido dos seus lançamentos e respondo '
            + 'sobre seus gastos. Pode me perguntar coisas como "quanto gastei em '
            + 'mercado esse mês?" ou pedir conselho sobre onde economizar.',
        };

      case INTENCAO.RESUMO_MES: {
        const r = await consulta.resumoDoMes(dados, { mes: parametros.mes });
        if (!r.quantidadeDeLancamentos) {
          return { intencao, consultasUsadas: ['resumoDoMes'],
            texto: `Não há lançamentos registrados em ${mesPorExtenso(r.mes)}.` };
        }

        const linhas = [
          `Em ${negrito(mesPorExtenso(r.mes), canal)}:`,
          `• Receitas: ${negrito(moeda(r.receitas), canal)}`,
          `• Despesas: ${negrito(moeda(r.gastos), canal)}`,
          `• Saldo: ${negrito(moeda(r.saldo), canal)}`,
        ];
        if (r.porPessoa.length > 1) {
          linhas.push('', 'Por pessoa:');
          for (const p of r.porPessoa) linhas.push(`• ${p.pessoa}: ${moeda(p.gastos)}`);
        }
        return { intencao, consultasUsadas: ['resumoDoMes'], texto: linhas.join('\n') };
      }

      case INTENCAO.GASTO_CATEGORIA: {
        const r = await consulta.gastoPorCategoria(dados, parametros);
        const item = r.categorias[0];

        if (!item) {
          return { intencao, consultasUsadas: ['gastoPorCategoria'],
            texto: `Não encontrei gastos em ${negrito(parametros.categoria, canal)} `
              + `em ${mesPorExtenso(r.mes)}.` };
        }

        const linhas = [
          `Em ${mesPorExtenso(r.mes)}, você gastou ${negrito(moeda(item.total), canal)} `
          + `em ${negrito(item.categoria, canal)} — ${item.fatiaDoMes}% do mês.`,
        ];
        if (item.subcategorias.length) {
          linhas.push('');
          for (const s of item.subcategorias) {
            linhas.push(`• ${s.subcategoria}: ${moeda(s.total)}`);
          }
        }
        return { intencao, consultasUsadas: ['gastoPorCategoria'], texto: linhas.join('\n') };
      }

      case INTENCAO.POR_CATEGORIA:
      case INTENCAO.MAIOR_GASTO: {
        const r = await consulta.gastoPorCategoria(dados, { mes: parametros.mes });
        if (!r.categorias.length) {
          return { intencao, consultasUsadas: ['gastoPorCategoria'],
            texto: `Não há gastos registrados em ${mesPorExtenso(r.mes)}.` };
        }

        const quantas = intencao === INTENCAO.MAIOR_GASTO ? 5 : 10;
        const linhas = [
          `Em ${negrito(mesPorExtenso(r.mes), canal)} você gastou `
          + `${negrito(moeda(r.totalDeGastosNoMes), canal)}:`,
          '',
        ];
        for (const c of r.categorias.slice(0, quantas)) {
          linhas.push(`• ${c.categoria}: ${negrito(moeda(c.total), canal)} (${c.fatiaDoMes}%)`);
        }
        if (intencao === INTENCAO.MAIOR_GASTO) {
          const topo = r.categorias[0];
          linhas.push('', `O maior peso é ${negrito(topo.categoria, canal)}, `
            + `com ${topo.fatiaDoMes}% de tudo que saiu no mês.`);
        }
        return { intencao, consultasUsadas: ['gastoPorCategoria'], texto: linhas.join('\n') };
      }

      case INTENCAO.COMPARATIVO: {
        const r = await consulta.compararPeriodos(dados, { mesB: parametros.mesB });
        const subiram = r.porCategoria.filter((c) => c.variacao > 0).slice(0, 5);
        const cairam = r.porCategoria.filter((c) => c.variacao < 0).slice(0, 3);

        const sinal = r.variacaoTotal >= 0 ? 'a mais' : 'a menos';
        const linhas = [
          `${negrito(mesPorExtenso(r.para), canal)} contra `
          + `${negrito(mesPorExtenso(r.de), canal)}:`,
          '',
          `• ${mesPorExtenso(r.de)}: ${moeda(r.totalDe)}`,
          `• ${mesPorExtenso(r.para)}: ${moeda(r.totalPara)}`,
          `• Diferença: ${negrito(moeda(Math.abs(r.variacaoTotal)), canal)} ${sinal}`,
        ];
        if (subiram.length) {
          linhas.push('', 'Subiu:');
          for (const c of subiram) linhas.push(`• ${c.categoria}: +${moeda(c.variacao)}`);
        }
        if (cairam.length) {
          linhas.push('', 'Caiu:');
          for (const c of cairam) linhas.push(`• ${c.categoria}: -${moeda(Math.abs(c.variacao))}`);
        }
        return { intencao, consultasUsadas: ['compararPeriodos'], texto: linhas.join('\n') };
      }

      case INTENCAO.LISTAR_LANCAMENTOS: {
        const LIMITE = 12;

        // O total vem da AGREGAÇÃO, nunca da soma da lista exibida.
        //
        // A primeira versão somava os `lancamentos` devolvidos — que vêm
        // truncados no limite. Em produção isso respondeu "Mercado — R$ 903,17"
        // quando o total do mês era R$ 1.369,31, porque havia mais de 12
        // lançamentos: número errado, com cara de exato, ao lado de uma lista
        // que parecia completa. Achado no teste ao vivo de 20/08/2026.
        const [r, agregado] = await Promise.all([
          consulta.listarLancamentos(dados, { ...parametros, limite: LIMITE }),
          consulta.gastoPorCategoria(dados, parametros),
        ]);

        const lista = r.lancamentos || [];
        const mesDaResposta = mesPorExtenso(parametros.mes || r.mes);

        if (!lista.length) {
          return { intencao, consultasUsadas: ['listarLancamentos'],
            texto: `Não encontrei lançamentos de ${negrito(parametros.categoria, canal)} `
              + `em ${mesDaResposta}.` };
        }

        const total = agregado.categorias[0]?.total
          ?? lista.reduce((s, t) => s + Number(t.valor || 0), 0);

        const linhas = [
          `${negrito(parametros.categoria, canal)} em ${mesDaResposta} — `
          + `${negrito(moeda(total), canal)}:`,
          '',
        ];
        for (const t of lista) {
          const dia = String(t.data || '').slice(8, 10);
          const desc = t.descricao || 'sem descrição';
          linhas.push(dia ? `• dia ${dia} — ${desc}: ${moeda(t.valor)}`
            : `• ${desc}: ${moeda(t.valor)}`);
        }

        // Lista truncada precisa DIZER que está truncada, senão a pessoa soma
        // o que vê e não fecha com o total.
        if (r.quantidadeTotal > lista.length) {
          linhas.push('', `_Mostrando ${lista.length} de ${r.quantidadeTotal} lançamentos._`);
        }

        return { intencao, consultasUsadas: ['listarLancamentos', 'gastoPorCategoria'],
          texto: linhas.join('\n') };
      }

      default:
        return null;
    }
  }

  return { responder };
}

module.exports = { criarConsultaDireta, moeda, mesPorExtenso };
