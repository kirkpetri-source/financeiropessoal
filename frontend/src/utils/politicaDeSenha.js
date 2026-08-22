/**
 * Política de senha do RevelaCash.
 *
 * O mínimo do Firebase é 6 caracteres, sem nenhuma outra exigência — para um
 * sistema que guarda a vida financeira de uma família inteira, isso é pouco:
 * "123456" passava. As regras aqui valem no CADASTRO e na TROCA de senha.
 *
 * Deliberadamente NÃO se exige caractere especial. Comprimento é o que
 * realmente importa contra força bruta; exigir símbolo empurra a pessoa para
 * "Senha@1", que é curta, previsível e ainda por cima difícil de lembrar. Por
 * isso: 10 caracteres, com letra e número, e uma lista curta do que é óbvio
 * demais.
 *
 * Não bloqueia login de quem já tem senha antiga e curta — a política se
 * aplica a senha NOVA. Expulsar cliente pagante por causa de uma regra que
 * mudou depois seria péssimo, e ele troca a senha quando quiser.
 */

export const MINIMO_CARACTERES = 10;
export const MAXIMO_CARACTERES = 128;

/**
 * Senhas que não podem ser usadas, por óbvias demais.
 *
 * Lista curta de propósito: ela pega o caso preguiçoso (a pessoa digitando a
 * primeira coisa que vem à cabeça), não um ataque de dicionário — para isso
 * quem serve é o comprimento mínimo. A comparação é sem acento, minúscula, e
 * também casa quando a senha é a palavra proibida com números colados
 * ("senha123456"), que é a fuga mais comum.
 */
const OBVIAS = [
  'senha', 'password', '123456', '1234567890', 'qwerty', 'abc123',
  'revelacash', 'financeiro', 'admin', 'iloveyou', 'brasil',
];

function semAcento(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function ehObvia(senha) {
  const limpa = semAcento(String(senha)).toLowerCase();
  return OBVIAS.some((palavra) => {
    // "senha" sozinha, ou "senha" + só dígitos/repetição colados.
    const soRestamNumeros = limpa.split(palavra).join('');
    return limpa.includes(palavra) && /^\d*$/.test(soRestamNumeros);
  });
}

/**
 * A senha passa? Devolve a mensagem do primeiro problema, ou `null`.
 *
 * Uma mensagem por vez, e específica: listar todas as regras de uma vez faz a
 * pessoa reler tudo para achar qual ela quebrou.
 */
export function problemaNaSenha(senha) {
  const valor = String(senha || '');

  if (valor.length < MINIMO_CARACTERES) {
    return `Use pelo menos ${MINIMO_CARACTERES} caracteres.`;
  }
  if (valor.length > MAXIMO_CARACTERES) {
    return `No máximo ${MAXIMO_CARACTERES} caracteres.`;
  }
  if (!/[a-zA-Z]/.test(valor)) {
    return 'Inclua pelo menos uma letra.';
  }
  if (!/\d/.test(valor)) {
    return 'Inclua pelo menos um número.';
  }
  if (/^(.)\1+$/.test(valor)) {
    return 'Repetir o mesmo caractere não protege sua conta.';
  }
  if (ehObvia(valor)) {
    return 'Essa senha é muito comum. Escolha uma que só você saiba.';
  }
  return null;
}

/**
 * Força da senha para a barrinha da tela: 0 a 4.
 *
 * É um indicador de conforto, não a regra — quem decide se aceita é
 * `problemaNaSenha`. Uma senha pode marcar "razoável" e ainda assim ser
 * recusada (e o contrário nunca acontece: nada com problema passa de 1).
 */
export function forcaDaSenha(senha) {
  const valor = String(senha || '');
  if (!valor) return { nivel: 0, rotulo: '', cor: 'bg-border' };
  if (problemaNaSenha(valor)) return { nivel: 1, rotulo: 'Fraca', cor: 'bg-expense' };

  let pontos = 1;
  if (valor.length >= 14) pontos += 1;
  if (/[a-z]/.test(valor) && /[A-Z]/.test(valor)) pontos += 1;
  if (/[^a-zA-Z0-9]/.test(valor)) pontos += 1;

  const escala = {
    1: { nivel: 2, rotulo: 'Aceitável', cor: 'bg-amber-500' },
    2: { nivel: 3, rotulo: 'Boa', cor: 'bg-amber-400' },
    3: { nivel: 4, rotulo: 'Forte', cor: 'bg-income' },
    4: { nivel: 4, rotulo: 'Muito forte', cor: 'bg-income' },
  };
  return escala[Math.min(pontos, 4)];
}

/** Texto de apoio abaixo do campo, para a exigência não virar surpresa. */
export const DICA_DE_SENHA =
  `Pelo menos ${MINIMO_CARACTERES} caracteres, com letras e números. `
  + 'Uma frase curta que só você saiba funciona melhor que uma palavra com símbolos.';
