const { normalizar } = require('./normalizarTexto');

/**
 * Peças puras do fluxo de "IA perguntou a subcategoria, esperando resposta"
 * — sem Firestore, testáveis sem dublê (mesmo motivo de respostaTexto.js
 * estar separado de respostaWhatsapp.js). A parte com I/O (ler/escrever a
 * pendência, atualizar a transação) fica em lancamentoPorMensagem.js.
 */

const GATILHOS_PULAR_SUBCATEGORIA = ['pular', 'nenhuma', 'nenhum', 'sem subcategoria', 'cancelar'];

function telefoneDe(jid) {
  return jid ? String(jid).replace(/@.*/, '').replace(/\D/g, '') || null : null;
}

function montarPerguntaSubcategoria(categoryName, subcategorias) {
  const linhas = [`Em qual subcategoria de *${categoryName}* isso entra?`];
  subcategorias.forEach((s, i) => linhas.push(`${i + 1}) ${s.name}`));
  linhas.push('', 'Responda com o número, o nome, ou *pular*.');
  return linhas.join('\n');
}

/**
 * Decide o que fazer com uma resposta a uma pergunta de subcategoria — casa
 * por número, por nome exato, ou pelos gatilhos de "pular".
 *
 * @param {Array<{id: string, name: string}>} opcoes
 * @param {string} texto
 * @returns {{subcategoryId: string|null, resposta: string}|null} null quando o texto não é uma resposta válida (mensagem nova, não a esperada).
 */
function resolverRespostaConfirmacao(opcoes, texto) {
  const limpo = normalizar(texto);

  if (GATILHOS_PULAR_SUBCATEGORIA.includes(limpo)) {
    return { subcategoryId: null, resposta: '✅ Combinado, sem subcategoria.' };
  }

  const indice = Number(limpo);
  if (Number.isInteger(indice) && indice >= 1 && indice <= opcoes.length) {
    const escolhida = opcoes[indice - 1];
    return { subcategoryId: escolhida.id, resposta: `✅ Marquei em *${escolhida.name}*.` };
  }

  const alvo = opcoes.find((o) => normalizar(o.name) === limpo);
  if (alvo) return { subcategoryId: alvo.id, resposta: `✅ Marquei em *${alvo.name}*.` };

  return null;
}

module.exports = { telefoneDe, montarPerguntaSubcategoria, resolverRespostaConfirmacao };
