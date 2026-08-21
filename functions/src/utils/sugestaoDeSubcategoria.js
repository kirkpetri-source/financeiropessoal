const { normalizar } = require('./normalizarTexto');
const { ehConversaFiada } = require('./conversaFiada');

/**
 * A oferta de criar subcategoria: que nome propor e o que a pessoa respondeu.
 *
 * Módulo PURO (só depende de `normalizarTexto` e `conversaFiada`, os dois
 * folhas), para a bateria de frases reais rodar sem banco.
 *
 * O nome sai por REGRA, não por IA. É a primeira palavra significativa da
 * descrição, capitalizada — "ração cachorro" vira "Ração". Custo zero numa
 * feature que dispara em lançamento comum, e o erro é barato: a pessoa manda
 * outro nome na mesma resposta. Gastar uma chamada de modelo para escolher uma
 * palavra que o usuário pode corrigir de graça seria caro pelo motivo errado.
 */

/** Palavras que não servem como nome de subcategoria. */
const SEM_VALOR = new Set([
  'de', 'da', 'do', 'das', 'dos', 'no', 'na', 'nos', 'nas', 'em', 'com', 'sem',
  'para', 'pra', 'por', 'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas',
  'meu', 'minha', 'meus', 'minhas', 'e', 'ou', 'que', 'ao', 'aos',
  'compra', 'comprei', 'gastei', 'paguei', 'pago', 'gasto', 'despesa',
  'recebi', 'ganhei', 'receita', 'valor', 'reais', 'pila', 'conta',
]);

const MIN_LETRAS = 3;
const MAX_NOME = 20;

// Nome de subcategoria é curto por natureza ("Pet", "Pet Shop", "Ração").
// Resposta maior que isto é outra coisa, não uma resposta a esta pergunta.
const MAX_PALAVRAS_NOME = 2;
const MAX_PALAVRAS_RESPOSTA = 4;

const SIM = new Set(['sim', 's', 'pode', 'pode sim', 'quero', 'cria', 'criar',
  'ok', 'isso', 'isso mesmo', 'claro', 'aceito', 'confirmo', 'positivo', 'bora']);

const NAO = new Set(['nao', 'n', 'nao quero', 'deixa', 'deixa pra la', 'depois',
  'agora nao', 'negativo', 'para', 'pare', 'nunca', 'esquece', 'cancela']);

/** "ração" -> "Ração"; respeita nome composto ("pet shop" -> "Pet Shop"). */
function capitalizar(texto) {
  return String(texto || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Que nome propor para a descrição?
 *
 * @returns {string|null} null quando não sobrou palavra que sirva — e aí não
 *   vale oferecer nada, porque a sugestão sairia sem sentido.
 */
function nomeSugerido(descricao) {
  const palavras = String(descricao || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  for (const palavra of palavras) {
    // Compara sem acento, mas PROPÕE com o acento que a pessoa escreveu.
    const limpa = normalizar(palavra).replace(/[^\p{L}]/gu, '');
    if (!limpa || limpa.length < MIN_LETRAS || SEM_VALOR.has(limpa)) continue;

    const original = palavra.replace(/[^\p{L}À-ſ]/gu, '');
    if (!original) continue;

    return capitalizar(original).slice(0, MAX_NOME);
  }

  return null;
}

/**
 * O que a pessoa respondeu à oferta?
 *
 * @returns {{acao: 'CRIAR'|'RECUSAR', nome?: string, categoria?: string}|null}
 *   `null` = não era resposta a isto. A pendência é single-shot: quem chamou
 *   descarta e trata a mensagem como nova, que é o que já acontece com a
 *   pergunta de escolha de subcategoria.
 */
function interpretarResposta(texto, nomeProposto) {
  const bruto = String(texto || '').trim();
  if (!bruto) return null;

  const limpo = normalizar(bruto);

  if (NAO.has(limpo)) return { acao: 'RECUSAR' };
  if (SIM.has(limpo)) return { acao: 'CRIAR', nome: nomeProposto };

  // SAUDAÇÃO NÃO É NOME DE SUBCATEGORIA, e a barreira vem antes da regra de
  // "palavra solta vira nome". Sem ela, um "bom dia" chegando depois da oferta
  // criava a subcategoria *Bom Dia* — e a pessoa ainda recebia a confirmação
  // de que tinha criado. Cumprimentar logo depois de lançar é o caso mais
  // comum que existe no canal. Vem DEPOIS do sim/não de propósito: "sim" e
  // "não" também estão nessa lista, e ali eles são resposta.
  if (ehConversaFiada(bruto)) return null;

  const palavras = bruto.split(/\s+/).filter(Boolean);

  // FRASE NÃO É RESPOSTA A ISTO, e a barreira vem antes de qualquer split.
  //
  // Sem ela, "quanto gastei esse mês em mercado" casava no " em " e virava uma
  // subcategoria chamada "Quanto Gastei Esse M" — uma pergunta comum criando
  // lixo no cadastro da família. Achado por teste antes de ir para produção.
  if (palavras.length > MAX_PALAVRAS_RESPOSTA) return null;

  // "Pet em Casa" — nome e categoria-mãe na mesma resposta. Separa no ÚLTIMO
  // " em ": "Pet Shop em Casa" tem que virar nome "Pet Shop", não "Pet".
  const partes = bruto.split(/\s+em\s+/i);
  if (partes.length > 1) {
    const categoria = partes.pop().trim();
    const nome = partes.join(' em ').trim();
    if (nome && categoria && nome.split(/\s+/).length <= MAX_PALAVRAS_NOME) {
      return { acao: 'CRIAR', nome: capitalizar(nome).slice(0, MAX_NOME), categoria };
    }
    return null;
  }

  // Uma ou duas palavras soltas viram o nome.
  if (palavras.length <= MAX_PALAVRAS_NOME && /\p{L}/u.test(bruto)
      && limpo.replace(/[^\p{L}]/gu, '').length >= MIN_LETRAS) {
    return { acao: 'CRIAR', nome: capitalizar(bruto).slice(0, MAX_NOME) };
  }

  return null;
}

/**
 * A pergunta que sai no WhatsApp.
 *
 * Diz "subcategoria X dentro da categoria Y" com todas as letras. "Criei Pet
 * em Casa" é ambíguo para quem lê no celular — não dá para saber se Casa é uma
 * categoria, outra subcategoria ou um lugar. Nomear os dois níveis custa três
 * palavras e elimina a dúvida.
 */
function montarOfertaDeCriacao({ descricao, nome, categoriaNome, vezes }) {
  return `💡 Notei que *${descricao}* já apareceu ${vezes}x.\n\n`
    + `Quer criar a subcategoria *${nome}* dentro da categoria *${categoriaNome}*?\n\n`
    + '• *sim* para criar\n'
    + `• outro nome (ex.: *${nome === 'Pet' ? 'Animais' : 'Pet'}*)\n`
    + '• *NomeDaSub em NomeDaCategoria* para escolher as duas coisas\n'
    + '• *não* para eu parar de sugerir isso';
}

/**
 * A confirmação depois de criar.
 *
 * Ensina a regra de exatidão junto, e aqui não é enfeite: a memória casa a
 * descrição EXATA. Quem batizou de "Pet" e depois escreve "ração cachorro"
 * continua indo para o lugar certo (a memória guarda o vínculo), mas quem
 * escreve uma descrição NOVA começa do zero. Dizer isso na hora da criação é
 * mais barato que a pessoa descobrir sozinha achando que quebrou.
 */
function montarConfirmacaoDeCriacao({ nome, categoriaNome, descricao }) {
  return `✅ Pronto! Criei a subcategoria *${nome}* dentro da categoria *${categoriaNome}*.\n\n`
    + `Lançamentos escritos como *${descricao}* já vão direto pra lá. `
    + `Escrevendo *${nome.toLowerCase()}* na mensagem também funciona.\n\n`
    + '_Se escrever de um jeito bem diferente, eu não reconheço e volto a perguntar._';
}

module.exports = {
  nomeSugerido,
  interpretarResposta,
  montarOfertaDeCriacao,
  montarConfirmacaoDeCriacao,
  capitalizar,
  SEM_VALOR,
};
