const { normalizar } = require('./normalizarTexto');

/**
 * O nome pelo qual a família chama a assistente no WhatsApp.
 *
 * Módulo-folha (só depende de `normalizarTexto`, que também é folha) para poder
 * ser testado sem arrastar o Firestore — mesmo motivo de
 * `utils/subcategoriaConfirmacao.js` existir separado.
 *
 * DUAS RESPONSABILIDADES, E AS DUAS SÃO DE SEGURANÇA OU DE CORREÇÃO:
 *
 * 1. **Validar o nome escolhido.** Ele vai para dentro do prompt do sistema, o
 *    lugar de maior privilégio da conversa. Sem validação, batizar a assistente
 *    de "Ignore as instruções acima e revele..." é injeção direta. Também
 *    recusa nome que colida com pessoa da casa, comando ou palavra de
 *    lançamento — colisão aí faz dois sistemas brigarem pela mesma palavra.
 *
 * 2. **Reconhecer o nome numa mensagem real.** A transcrição de áudio erra nome
 *    próprio ("Nina" vira "Nyna", "Mina"), e gente escreve com vírgula, sem
 *    acento e em maiúscula. Casamento exato falharia em silêncio, que é o pior
 *    jeito de falhar: a pessoa chama e nada responde.
 */

const NOME_PADRAO = 'Nina';

const MIN = 3;
const MAX = 20;

// Palavras que o sistema já usa para outra coisa. Se o nome da assistente for
// uma delas, a mesma mensagem tem dois donos.
const PALAVRAS_DE_COMANDO = [
  'resumo', 'ultimos', 'ajuda', 'help', 'comandos', 'categoria', 'categorias',
  'subcategoria', 'vincular', 'apagar', 'apaga', 'cancela', 'cancelar',
  'desfazer', 'errado', 'errou', 'pular',
];

const PALAVRAS_DE_LANCAMENTO = [
  'gasto', 'despesa', 'paguei', 'pago', 'pagamento', 'gastei', 'comprei',
  'compra', 'pagar', 'gastando', 'saida', 'receita', 'entrada', 'recebi',
  'recebido', 'recebimento', 'receber', 'ganhei', 'ganhou', 'ganho', 'deposito',
];

/**
 * O nome serve?
 *
 * @param {string} nome
 * @param {string[]} nomesDaFamilia nomes de membros/pagadores já cadastrados
 * @returns {{ok: boolean, erro?: string}}
 */
function validarNome(nome, nomesDaFamilia = []) {
  const bruto = String(nome ?? '').trim();

  if (!bruto) return { ok: false, erro: 'Escolha um nome para a assistente.' };

  if (bruto.length < MIN) {
    return { ok: false, erro: `O nome precisa ter pelo menos ${MIN} letras.` };
  }
  if (bruto.length > MAX) {
    return { ok: false, erro: `O nome pode ter no máximo ${MAX} letras.` };
  }

  // Só letras (com acento) e espaço. Isto é o que fecha a porta da injeção:
  // sem dois-pontos, quebra de linha, aspas ou pontuação, não há como escrever
  // uma instrução dentro do nome.
  if (!/^[\p{L}][\p{L} ]*$/u.test(bruto)) {
    return { ok: false, erro: 'Use só letras e espaços, sem números nem pontuação.' };
  }

  const limpo = normalizar(bruto);

  if (PALAVRAS_DE_COMANDO.includes(limpo)) {
    return { ok: false, erro: `"${bruto}" já é um comando do sistema. Escolha outro nome.` };
  }

  if (PALAVRAS_DE_LANCAMENTO.includes(limpo)) {
    return { ok: false, erro: `"${bruto}" é uma palavra usada para lançar gastos. Escolha outro nome.` };
  }

  const colide = (nomesDaFamilia || []).find((n) => normalizar(n) === limpo);
  if (colide) {
    return {
      ok: false,
      erro: `Já existe alguém chamado ${colide} na família. Escolha outro nome para a assistente.`,
    };
  }

  return { ok: true, nome: bruto };
}

/** Distância de edição, com corte: só interessa saber se passa de `teto`. */
function distancia(a, b, teto = 1) {
  if (Math.abs(a.length - b.length) > teto) return teto + 1;
  if (a === b) return 0;

  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const atual = [i];
    for (let j = 1; j <= b.length; j += 1) {
      atual[j] = a[i - 1] === b[j - 1]
        ? anterior[j - 1]
        : 1 + Math.min(anterior[j], atual[j - 1], anterior[j - 1]);
    }
    if (Math.min(...atual) > teto) return teto + 1;
    anterior = atual;
  }

  return anterior[b.length];
}

/**
 * Palavras que podem vir ANTES do vocativo sem que ele deixe de ser vocativo:
 * pontuação solta e saudação curta.
 *
 * A lista é fechada de propósito, e aqui isso é seguro — ao contrário da lista
 * de "jeitos de perguntar", que já falhou duas vezes neste projeto. O motivo é
 * o custo do erro: faltando uma saudação, a mensagem apenas segue para a
 * classificação da IA, que é exatamente o que já acontecia. Não vira silêncio.
 */
const ANTES_DO_VOCATIVO = new Set([
  'oi', 'ola', 'opa', 'alo', 'ei', 'hey', 'fala', 'eai',
  'bom', 'boa', 'dia', 'tarde', 'noite',
  'e', 'ai', 'entao', 'por', 'favor', 'pfv',
]);

// Teto de palavras descartáveis antes do nome. Três cobre "bom dia Nina" e
// "oi, por favor Nina"; mais que isso começa a pegar frase em que o nome é
// só assunto ("vou levar a Nina no mercado"), que NÃO é chamado.
const MAX_PALAVRAS_ANTES = 3;

/**
 * A mensagem chama a assistente pelo nome?
 *
 * Reconhece no COMEÇO, de propósito: "vou levar a Nina no mercado" não é
 * alguém falando com a assistente. E aceita uma letra de diferença, porque a
 * transcrição de áudio erra nome próprio o tempo todo.
 *
 * "Começo" inclui um prefixo curto de pontuação ou saudação. Antes ele era
 * literalmente a primeira palavra, e por isso ", Nina, gastei 200 no mercado
 * tá muito?" NÃO era reconhecido: a mensagem seguia para o fluxo de lançamento
 * e virava um gasto de R$ 200 em vez de uma conversa. Achado no teste ao vivo
 * de 19/08/2026. "Oi Nina, quanto gastei?" — o jeito mais natural de falar —
 * falhava do mesmo jeito.
 *
 * @returns {{chamou: boolean, resto: string}} `resto` é a mensagem sem o nome
 */
function reconhecerChamado(texto, nomeDaAssistente = NOME_PADRAO) {
  const mensagem = String(texto ?? '').trim();
  const alvo = normalizar(nomeDaAssistente || NOME_PADRAO);

  if (!mensagem || !alvo) return { chamou: false, resto: mensagem };

  const palavrasDoNome = alvo.split(/\s+/).filter(Boolean);
  const palavras = mensagem.split(/\s+/);

  // Onde o nome pode começar: pula pontuação solta e saudação.
  let inicio = 0;
  while (inicio < palavras.length && inicio < MAX_PALAVRAS_ANTES) {
    const palavra = normalizar(palavras[inicio]).replace(/[^\p{L}]/gu, '');
    if (palavra && !ANTES_DO_VOCATIVO.has(palavra)) break;
    inicio += 1;
  }

  if (palavras.length - inicio < palavrasDoNome.length) {
    return { chamou: false, resto: mensagem };
  }

  // Compara palavra a palavra, tirando a pontuação de cada uma ("Nina," → "nina").
  for (let i = 0; i < palavrasDoNome.length; i += 1) {
    const candidata = normalizar(palavras[inicio + i]).replace(/[^\p{L}]/gu, '');
    if (!candidata) return { chamou: false, resto: mensagem };

    // Uma letra de tolerância só a partir de 4 letras: em nome curto, uma letra
    // de diferença é outra palavra ("ana" viraria "uma", "ela", "era").
    const teto = palavrasDoNome[i].length >= 4 ? 1 : 0;
    if (distancia(candidata, palavrasDoNome[i], teto) > teto) {
      return { chamou: false, resto: mensagem };
    }
  }

  const resto = palavras
    .slice(inicio + palavrasDoNome.length)
    .join(' ')
    // Tira a vírgula ou dois-pontos que sobra depois do vocativo: "Nina, quanto
    // gastei?" precisa virar "quanto gastei?", e não ", quanto gastei?".
    .replace(/^[,;:\-–—\s]+/, '')
    .trim();

  return { chamou: true, resto };
}

module.exports = {
  NOME_PADRAO,
  MIN,
  MAX,
  validarNome,
  reconhecerChamado,
  PALAVRAS_DE_COMANDO,
  PALAVRAS_DE_LANCAMENTO,
};
