import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Teste ESTÁTICO dos nomes das funções agendadas.
 *
 * O Cloud Scheduler identifica cada job pelo NOME EXPORTADO. Renomear
 * `executarExclusoes` não renomeia o agendamento: cria um novo e deixa o antigo
 * vivo, rodando a versão velha do código. No caso desta função específica isso
 * significa **dois jobs apagando família ao mesmo tempo** — irreversível, e
 * descoberto só quando alguém reclamar de dado sumido.
 *
 * O risco é real justamente porque renomear parece inofensivo: o corpo da
 * `executarExclusoes` deixou de ser só LGPD em 21/08/2026 e a tentação de
 * chamá-la de `rotinaDiaria` é imediata. Se um dia for preciso mesmo, o caminho
 * é criar a nova, conferir que rodou, e só então apagar o job antigo no Cloud
 * Scheduler à mão — nunca renomear e deployar.
 *
 * Não dá para importar `index.js` no vitest: ele carrega `firebaseAdmin` na
 * primeira linha e a trava da regra 2 derruba a suíte. Então lê-se o arquivo.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const index = readFileSync(join(raiz, 'index.js'), 'utf8');

const AGENDADAS = [
  'pollWhatsapp',
  'executarExclusoes',
  'gerarContasRecorrentes',
  'fecharFaturas',
];

describe('nomes das funções agendadas', () => {
  for (const nome of AGENDADAS) {
    it(`${nome} continua exportada com esse nome`, () => {
      expect(index).toContain(`exports.${nome} = onSchedule(`);
    });
  }

  it('a API continua exportada como api', () => {
    expect(index).toContain('exports.api = onRequest(');
  });
});

describe('executarExclusoes faz as duas tarefas, isoladas', () => {
  const corpo = index.slice(
    index.indexOf('exports.executarExclusoes'),
    index.indexOf('exports.gerarContasRecorrentes'),
  );

  it('chama a exclusão da LGPD', () => {
    expect(corpo).toContain('executarExclusoesPendentes(');
  });

  it('chama a varredura de chamados inativos', () => {
    expect(corpo).toContain('resolverInativos(');
  });

  it('cada tarefa tem o próprio try/catch', () => {
    // Duas tentativas e dois catch: uma varredura falhando não pode levar a
    // outra junto. Com um try só, um erro na LGPD deixaria chamado inativo
    // acumulando na fila sem ninguém entender por quê.
    expect((corpo.match(/try \{/g) || []).length).toBe(2);
    expect((corpo.match(/catch \(err\)/g) || []).length).toBe(2);
  });
});
