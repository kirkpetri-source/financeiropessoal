/**
 * Leitor de extrato OFX (Open Financial Exchange).
 *
 * OFX é o formato padronizado que Banco do Brasil, Itaú, Bradesco, Santander,
 * Caixa, Inter, C6, Nubank e Sicoob exportam — por isso é o caminho preferido
 * da importação: um leitor só atende todos, em vez de um parser por banco que
 * quebra sempre que o banco mexe no layout do CSV.
 *
 * Duas coisas tornam o OFX melhor que CSV para este uso:
 *
 *   1. `FITID` — identificador único da transação, dado pelo PRÓPRIO banco. É
 *      a base do controle de duplicata: reimportar o mesmo mês não duplica
 *      nada, sem depender de adivinhar por data+valor+descrição.
 *   2. O sinal do valor é explícito (`TRNAMT` negativo = saída), então não é
 *      preciso deduzir se a linha é gasto ou entrada.
 *
 * Por que um leitor à mão em vez de biblioteca: OFX 1.x NÃO é XML válido —
 * é SGML, com tags que frequentemente não fecham (`<NAME>Padaria` sem
 * `</NAME>`). Parser de XML de verdade recusa o arquivo do Itaú e do BB.
 * O formato é simples o bastante para ler direto, e assim não entra
 * dependência nova numa Cloud Function.
 */

const { paraDataISO } = require('./datas');

/** Tags que interessam dentro de cada <STMTTRN> (transação). */
const CAMPOS = {
  TRNTYPE: 'tipo',
  DTPOSTED: 'data',
  TRNAMT: 'valor',
  FITID: 'idDoBanco',
  MEMO: 'memo',
  NAME: 'nome',
  CHECKNUM: 'documento',
};

/**
 * Extrai o valor de uma tag SGML/XML.
 *
 * Aceita os dois jeitos que os bancos escrevem:
 *   <NAME>Padaria</NAME>   (fechada — Nubank, Inter)
 *   <NAME>Padaria          (aberta, termina na próxima tag — Itaú, BB)
 */
function valorDaTag(bloco, tag) {
  const fechada = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(bloco);
  if (fechada) return fechada[1].trim();

  const aberta = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(bloco);
  return aberta ? aberta[1].trim() : null;
}

/**
 * Data do OFX: `AAAAMMDD` com sufixos opcionais de hora e fuso
 * (`20260813`, `20260813120000`, `20260813120000[-3:BRT]`).
 * Só os 8 primeiros dígitos importam — a hora não é usada em nenhum
 * lugar do sistema, e o fuso do banco introduziria erro de um dia.
 */
function dataDoOfx(bruto) {
  if (!bruto) return null;
  const digitos = String(bruto).replace(/[^0-9]/g, '').slice(0, 8);
  if (digitos.length !== 8) return null;

  return paraDataISO(
    Number(digitos.slice(0, 4)),
    Number(digitos.slice(4, 6)),
    Number(digitos.slice(6, 8)),
  );
}

/**
 * Valor do OFX. Vem com ponto decimal (`-84.90`), mas alguns bancos
 * brasileiros exportam com vírgula (`-84,90`) mesmo sendo fora do padrão.
 */
function valorDoOfx(bruto) {
  if (bruto == null || bruto === '') return null;
  const limpo = String(bruto).trim().replace(/\s/g, '').replace(',', '.');
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/**
 * A descrição útil para a pessoa. Bancos distribuem o texto entre MEMO e NAME
 * de forma inconsistente: o Itaú usa MEMO, o Nubank usa NAME, alguns usam os
 * dois com conteúdos diferentes. Junta os dois quando não são redundantes.
 */
function descricaoDe({ nome, memo }) {
  const a = (nome || '').trim();
  const b = (memo || '').trim();

  if (!a) return b;
  if (!b) return a;
  if (a.toLowerCase() === b.toLowerCase()) return a;
  if (b.toLowerCase().includes(a.toLowerCase())) return b;
  if (a.toLowerCase().includes(b.toLowerCase())) return a;
  return `${a} - ${b}`;
}

function ehOfx(conteudo) {
  if (!conteudo || typeof conteudo !== 'string') return false;
  const inicio = conteudo.slice(0, 2000).toUpperCase();
  return inicio.includes('OFXHEADER') || inicio.includes('<OFX>') || inicio.includes('<STMTTRN>');
}

/**
 * Lê o extrato e devolve as transações normalizadas.
 *
 * Nunca lança por causa de uma linha ruim: transação sem data ou sem valor é
 * descartada e contada em `ignoradas`. Um extrato de 200 linhas não pode ser
 * recusado inteiro porque uma veio torta — quem importa quer as 199 boas.
 *
 * @returns {{transacoes: Array, ignoradas: number, conta: object|null}}
 */
function lerOfx(conteudo) {
  if (!ehOfx(conteudo)) {
    throw Object.assign(new Error('Arquivo não parece ser um extrato OFX.'), { statusCode: 400 });
  }

  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];

  const transacoes = [];
  let ignoradas = 0;

  for (const bloco of blocos) {
    const cru = {};
    for (const [tag, campo] of Object.entries(CAMPOS)) {
      cru[campo] = valorDaTag(bloco, tag);
    }

    const data = dataDoOfx(cru.data);
    const valor = valorDoOfx(cru.valor);
    const descricao = descricaoDe(cru);

    // Valor zero não é lançamento — é ajuste/estorno neutro do banco, e
    // entraria como despesa de R$ 0,00 poluindo o extrato da família.
    if (!data || valor == null || valor === 0 || !descricao) {
      ignoradas += 1;
      continue;
    }

    transacoes.push({
      data,
      descricao,
      // Sinal decide o tipo: no OFX, saída é sempre negativa.
      tipo: valor < 0 ? 'EXPENSE' : 'INCOME',
      valor: Math.abs(valor),
      idDoBanco: cru.idDoBanco || null,
      documento: cru.documento || null,
      tipoDoBanco: cru.tipo || null,
    });
  }

  return {
    transacoes,
    ignoradas,
    conta: dadosDaConta(conteudo),
  };
}

/** Banco e conta, quando o arquivo informa — vira contexto na tela de conferência. */
function dadosDaConta(conteudo) {
  const banco = valorDaTag(conteudo, 'BANKID');
  const conta = valorDaTag(conteudo, 'ACCTID');
  const moeda = valorDaTag(conteudo, 'CURDEF');
  if (!banco && !conta) return null;

  return {
    banco: banco || null,
    // Só os últimos dígitos: o número da conta inteiro não é necessário para
    // nada na tela e é dado sensível a menos para carregar.
    contaFinal: conta ? String(conta).slice(-4) : null,
    moeda: moeda || null,
  };
}

module.exports = { lerOfx, ehOfx, valorDaTag, dataDoOfx, valorDoOfx, descricaoDe };
