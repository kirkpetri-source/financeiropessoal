import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Teste ESTÁTICO: lê o código em vez de executá-lo.
 *
 * Existe porque a armadilha que ele guarda não dá para exercitar em vitest.
 * Importar `app.js` arrasta `routes/admin.js`, que importa `firebaseAdmin` no
 * topo, e a trava da regra 2 derruba a suíte inteira — a mesma limitação já
 * documentada para o webhook do WhatsApp.
 *
 * E a armadilha é séria: `routes/admin.js` faz `router.use(authMiddleware,
 * apenasAdmin)` no topo, então tudo registrado depois exige administrador. Se
 * `/plataforma/chamados` for montado DEPOIS de `/plataforma` em `app.js`, o
 * Express manda a requisição para o router do admin e **todo atendente vira
 * administrador**. Não aparece erro nenhum: as rotas continuam respondendo,
 * só que exigindo a permissão errada. Um teste que só chamasse os services
 * passaria feliz.
 *
 * Mesmo espírito de `dependencias.test.mjs`, que também analisa o código em vez
 * de rodá-lo.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => readFileSync(join(raiz, arquivo), 'utf8');

/**
 * Sem comentários — e isto NÃO é detalhe.
 *
 * A primeira versão destes testes lia o arquivo inteiro, e as asserções de
 * "não contém" quebraram no próprio comentário que EXPLICA a regra: o
 * `chamadosOperador.js` cita `apenasAdmin` ao dizer por que não o usa. Pior que
 * o falso alarme seria o contrário — apagar o comentário faria um teste
 * quebrado passar a "passar", e ninguém desconfiaria.
 *
 * Só linhas inteiras de comentário são removidas: cortar `//` no meio da linha
 * estragaria qualquer `https://` dentro de string.
 */
function semComentarios(fonte) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((linha) => !/^\s*\/\//.test(linha))
    .join('\n');
}

const lerCodigo = (arquivo) => semComentarios(ler(arquivo));

describe('ordem dos routers em app.js', () => {
  const app = ler('app.js');

  it('/plataforma/chamados é montado ANTES de /plataforma', () => {
    const atendimento = app.indexOf("app.use('/plataforma/chamados'");
    const admin = app.indexOf("app.use('/plataforma', adminRoutes)");

    expect(atendimento).toBeGreaterThan(-1);
    expect(admin).toBeGreaterThan(-1);
    expect(atendimento).toBeLessThan(admin);
  });

  it('a rota de anexos tem o limite de corpo próprio, antes do parser global', () => {
    const anexos = app.indexOf("app.use('/suporte/anexos', express.json(");
    const global = app.indexOf("app.use(express.json({ limit: '1mb' }))");

    expect(anexos).toBeGreaterThan(-1);
    expect(anexos).toBeLessThan(global);
  });
});

describe('quem guarda cada router', () => {
  it('o atendimento exige operador ativo, e NÃO admin', () => {
    const rota = lerCodigo('routes/chamadosOperador.js');

    expect(rota).toContain('apenasOperadorAtivo');
    expect(rota).not.toContain('apenasAdmin');
  });

  it('o painel gestor continua exigindo admin', () => {
    expect(lerCodigo('routes/admin.js')).toContain('apenasAdmin');
  });

  it('as rotas do cliente não passam por exigirAssinatura (regra 6)', () => {
    // Suporte é o canal de quem tem problema, e o problema mais comum de quem
    // está com a assinatura vencida é justamente a cobrança.
    expect(lerCodigo('routes/chamados.js')).not.toContain('exigirAssinatura');
  });
});

describe('ordem das rotas dentro do router do operador', () => {
  it('/operadores vem antes de /:numero', () => {
    const rota = lerCodigo('routes/chamadosOperador.js');

    const operadores = rota.indexOf("router.get('/operadores'");
    const porNumero = rota.indexOf("router.get('/:numero'");

    expect(operadores).toBeGreaterThan(-1);
    // Com /:numero primeiro, um GET /operadores entraria nele com
    // numero='operadores' e voltaria 404 — a tela de encaminhamento ficaria
    // sem lista, sem nenhum erro no servidor.
    expect(operadores).toBeLessThan(porNumero);
  });
});

describe('rotas de backup — o curinga não pode engolir as irmãs', () => {
  const admin = readFileSync(
    new URL('../routes/admin.js', import.meta.url), 'utf8',
  );

  it('/backups/auditoria é registrada ANTES de /backups/*', () => {
    // O Express casa na ordem de registro. Com o curinga primeiro, um GET em
    // /backups/auditoria viraria "baixe o backup chamado auditoria" e voltaria
    // 404 — sem erro nenhum aparecer no servidor, só a tela sem histórico.
    const auditoria = admin.indexOf("router.get('/backups/auditoria'");
    const curinga = admin.indexOf("router.get('/backups/*'");

    expect(auditoria).toBeGreaterThan(-1);
    expect(curinga).toBeGreaterThan(-1);
    expect(auditoria).toBeLessThan(curinga);
  });
});
