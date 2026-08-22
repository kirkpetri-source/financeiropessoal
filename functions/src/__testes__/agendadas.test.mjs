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

  it('cada tarefa é vigiada por si — uma falhando não leva a outra junto', () => {
    // Duas chamadas independentes a `vigiar`, que engole o erro de cada uma e
    // registra o aviso. Numa chamada só (ou num try compartilhado), um erro na
    // LGPD deixaria chamado inativo acumulando na fila sem ninguém entender
    // por quê.
    expect((corpo.match(/await vigiar\(/g) || []).length).toBe(2);
  });
});

describe('toda agendada é vigiada — erro em rotina não pode virar só log', () => {
  // O `vigiar` é o que transforma falha de rotina em aviso na tela do
  // operador (services/alertaOperacionalService.js). Uma agendada nova que
  // esqueça dele volta ao mundo em que a varredura quebra em silêncio.
  const AGENDADAS = [
    'executarExclusoes',
    'gerarContasRecorrentes',
    'fecharFaturas',
    'backupDiario',
  ];

  it.each(AGENDADAS)('%s chama vigiar', (nome) => {
    const inicio = index.indexOf(`exports.${nome} = onSchedule(`);
    expect(inicio).toBeGreaterThan(-1);

    const proxima = index.indexOf('exports.', inicio + 10);
    const corpo = index.slice(inicio, proxima === -1 ? undefined : proxima);

    expect(corpo).toContain('vigiar(');
  });
});

describe('backup diário', () => {
  const corpo = index.slice(index.indexOf('exports.backupDiario'));

  it('roda ANTES da varredura de exclusões da LGPD', () => {
    // Backup às 02:00, exclusões às 03:00: o backup do dia sempre contém o que
    // a varredura vai apagar em seguida. Invertido, o que foi apagado nunca
    // esteve num backup.
    expect(corpo).toContain("schedule: 'every day 02:00'");

    const lgpd = index.slice(index.indexOf('exports.executarExclusoes'));
    expect(lgpd).toContain("schedule: 'every day 03:00'");
  });

  it('usa o export nativo do Firestore, não um dump pela memória da function', () => {
    expect(corpo).toContain('exportarAgora(');
  });
});

describe('interruptor de backup por ambiente', () => {
  // Homologação não faz backup de propósito (BACKUP_ATIVO=false). O que estes
  // testes protegem é o SILÊNCIO ser explícito: a checagem tem que vir ANTES
  // do `vigiar`, senão o ambiente desligado continua gerando o aviso diário
  // que a variável existe para calar — e nunca pode virar "sem configuração,
  // sem backup e sem aviso", que é como um backup de produção some sem
  // ninguém perceber.
  const rotinas = ['backupDiario', 'copiaSemanalPorEmail'];

  it.each(rotinas)('%s desiste antes de vigiar quando o ambiente está desligado', (nome) => {
    const inicio = index.indexOf(`exports.${nome} = onSchedule(`);
    const proxima = index.indexOf('exports.', inicio + 10);
    const corpo = index.slice(inicio, proxima === -1 ? undefined : proxima);

    expect(corpo).toContain('backupDesligado()');
    expect(corpo.indexOf('backupDesligado()')).toBeLessThan(corpo.indexOf('vigiar('));
  });
});
