const { z } = require('zod');

/**
 * Limite do texto do extrato aceito no corpo. 2000 linhas de OFX ficam bem
 * abaixo disto; o teto existe para um arquivo errado (um PDF renomeado, um
 * dump gigante) morrer na porta em vez de virar trabalho de parser.
 */
const MAX_CONTEUDO = 3 * 1024 * 1024;

const analisarSchema = z.object({
  conteudo: z.string({ required_error: 'Envie o arquivo do extrato.' })
    .min(1, 'Arquivo vazio.')
    .max(MAX_CONTEUDO, 'Arquivo muito grande. Exporte o extrato por período menor.'),
  nomeArquivo: z.string().max(200).optional(),
});

/**
 * A confirmação manda só índice e (opcionalmente) a categoria escolhida —
 * valor, data e descrição vêm do rascunho que o SERVIDOR leu. Aceitar esses
 * campos do cliente abriria caminho para gravar um lançamento "importado" que
 * o extrato nunca teve.
 *
 * Sem `.default()` em campo nenhum (regra 10 do projeto).
 */
const confirmarSchema = z.object({
  escolhas: z.array(z.object({
    indice: z.number().int().min(0),
    categoria: z.string().min(1).max(60).optional(),
  })).min(1, 'Selecione ao menos um lançamento.').max(2000),
});

module.exports = { analisarSchema, confirmarSchema, MAX_CONTEUDO };
