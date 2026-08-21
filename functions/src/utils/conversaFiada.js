/**
 * A conversa que não pede resposta — a lista do que NÃO passa.
 *
 * É curta, fechada e estável, ao contrário da lista de "jeitos de perguntar",
 * que é infinita. Foi essa inversão que consertou a mensagem descartada em
 * silêncio em 18/08/2026 ("Detalhe os gastos de moradia" não estava na lista
 * de aberturas aceitas e sumia sem virar log).
 *
 * Mora num módulo-folha próprio porque DOIS lugares precisam da mesma
 * definição de "isto não é resposta a nada":
 *
 * - o roteador, para não gastar IA com "bom dia";
 * - a oferta de criar subcategoria, onde a mesma frase criava uma subcategoria
 *   chamada *Bom Dia*. Qualquer palavra solta serve como nome, e uma saudação
 *   chegando logo depois da oferta é o caso mais comum que existe: a pessoa
 *   lança de manhã, o sistema oferece, ela cumprimenta.
 *
 * Duas cópias da lista seriam duas listas divergindo com o tempo.
 */

/** Só bloqueia quando a mensagem é ISSO e nada mais: "ok" sozinho é
 *  confirmação, "ok, e quanto gastei?" é pergunta. */
const CONVERSA_FIADA = new Set([
  'oi', 'ola', 'opa', 'e ai', 'eai', 'fala', 'alo',
  'bom dia', 'boa tarde', 'boa noite', 'bom dia!', 'boa tarde!', 'boa noite!',
  'obrigado', 'obrigada', 'obg', 'valeu', 'vlw', 'brigado', 'brigada',
  'ok', 'okay', 'blz', 'beleza', 'certo', 'isso', 'isso mesmo', 'perfeito',
  'sim', 'nao', 'claro', 'ta', 'ta bom', 'tudo bem', 'entendi', 'show',
  'kkk', 'kkkk', 'kkkkk', 'rs', 'rsrs', 'haha', 'hahaha', 'ata',
  'tchau', 'falou', 'ate mais', 'ate logo', 'boa', 'legal', 'top', 'otimo',
]);

/** Normalização própria (sem acento, sem pontuação final, espaço colapsado) —
 *  o módulo é folha de propósito, para poder ser usado de qualquer lugar. */
function normalizarParaComparar(texto) {
  return String(texto || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[!.,;]+$/, '')
    .replace(/\s+/g, ' ');
}

/** A mensagem é só conversa fiada, e nada mais? */
function ehConversaFiada(texto) {
  const limpo = normalizarParaComparar(texto);
  if (!limpo) return false;
  return CONVERSA_FIADA.has(limpo);
}

module.exports = { CONVERSA_FIADA, ehConversaFiada, normalizarParaComparar };
