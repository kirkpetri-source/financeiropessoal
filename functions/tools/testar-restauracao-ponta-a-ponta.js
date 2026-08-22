/**
 * Ensaio de restauração de VERDADE: grava, faz backup, APAGA, restaura e
 * confere documento por documento.
 *
 *   ALVO=staging node tools/testar-restauracao-ponta-a-ponta.js
 *
 * Por que existe: o export nativo do Firestore (o backup diário, o do bucket)
 * só se prova com um `firestore import`, que exige permissão de IAM que
 * nenhuma credencial deste projeto tem. Enquanto esse ensaio não for possível,
 * o `tools/backup.js` + `tools/restore.js` é o caminho de recuperação que dá
 * para provar HOJE — e é ele que uma pessoa usaria para repor uma coleção
 * específica, ou para conferir o que havia num documento apagado.
 *
 * O ponto fraco de um backup em JSON não é o texto: é a TRADUÇÃO dos tipos do
 * Firestore que o JSON não tem. Timestamp, GeoPoint, referência, bytes, mapa
 * aninhado, array com objeto dentro, `null` — cada um desses vira uma
 * convenção nossa na ida (`__tipo__`) e precisa voltar exatamente igual. Um
 * erro aqui não quebra nada na hora do backup: ele aparece meses depois, na
 * restauração, com uma data virando texto e o sistema inteiro rejeitando o
 * documento. Por isso o teste planta um documento com TODOS esses tipos.
 *
 * RECUSA rodar em produção. Ele apaga o que planta, e um apagar com o alvo
 * errado é exatamente o desastre de que backup deveria proteger.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { ALVO } = require('./carregarAmbiente');

if (ALVO !== 'staging') {
  console.error('\nEste teste APAGA documentos. Só roda em homologação:');
  console.error('  ALVO=staging node tools/testar-restauracao-ponta-a-ponta.js\n');
  process.exit(1);
}

const { carregar } = require('./carregarAmbiente');
carregar();

const { admin, db } = require('../src/config/firebaseAdmin');

const COLECAO = 'ensaioDeRestauracao';
const SUBCOLECAO = 'itens';

let problemas = 0;
const ok = (t) => console.log(`  OK      ${t}`);
const falha = (t) => { problemas += 1; console.log(`  FALHA   ${t}`); };

/**
 * Um documento com um exemplar de cada tipo que o Firestore guarda e que o
 * JSON não sabe representar sozinho.
 */
function documentoCompleto() {
  return {
    texto: 'Padaria do Zé — açúcar, café & pão',
    numeroInteiro: 42,
    numeroQuebrado: 1234.56,
    negativo: -0.01,
    verdadeiro: true,
    falso: false,
    nulo: null,
    data: admin.firestore.Timestamp.fromDate(new Date('2026-06-17T13:45:12.345Z')),
    lugar: new admin.firestore.GeoPoint(-17.5696, -52.5511), // Mineiros-GO
    referencia: db.collection('categories').doc('cat-mercado'),
    binario: Buffer.from('comprovante-falso-para-teste'),
    lista: [1, 'dois', false, null, { dentro: 'objeto na lista' }],
    mapa: {
      nivel1: {
        nivel2: {
          data: admin.firestore.Timestamp.fromDate(new Date('2025-12-31T23:59:59Z')),
          valor: 99.9,
        },
      },
    },
    listaDeDatas: [
      admin.firestore.Timestamp.fromDate(new Date('2026-01-01T00:00:00Z')),
      admin.firestore.Timestamp.fromDate(new Date('2026-02-01T00:00:00Z')),
    ],
  };
}

/**
 * Compara o que voltou com o que foi plantado.
 *
 * Timestamp, GeoPoint, referência e Buffer não são comparáveis por igualdade
 * simples nem por JSON — cada um vira uma forma canônica antes.
 */
function canonico(valor) {
  if (valor === null || valor === undefined) return null;

  if (valor instanceof admin.firestore.Timestamp) return `ts:${valor.toDate().toISOString()}`;
  if (valor instanceof admin.firestore.GeoPoint) return `geo:${valor.latitude},${valor.longitude}`;
  if (valor && typeof valor.path === 'string' && typeof valor.id === 'string') return `ref:${valor.path}`;
  if (Buffer.isBuffer(valor)) return `bytes:${valor.toString('base64')}`;
  if (valor instanceof Uint8Array) return `bytes:${Buffer.from(valor).toString('base64')}`;

  if (Array.isArray(valor)) return valor.map(canonico);

  if (typeof valor === 'object') {
    const saida = {};
    for (const chave of Object.keys(valor).sort()) saida[chave] = canonico(valor[chave]);
    return saida;
  }
  return valor;
}

function iguais(a, b) {
  return JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));
}

async function apagarColecao(ref) {
  const snap = await ref.get();
  for (const doc of snap.docs) {
    for (const sub of await doc.ref.listCollections()) await apagarColecao(sub);
    await doc.ref.delete();
  }
}

(async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'ensaio-restauracao-'));
  const arquivo = path.join(pasta, 'dump.json');
  const raiz = path.join(__dirname, '..');

  try {
    // ── 1. planta ──────────────────────────────────────────────────────────
    console.log('\n--- Planta os documentos ---');
    await apagarColecao(db.collection(COLECAO)); // resto de uma execução anterior

    const original = documentoCompleto();
    const doc = db.collection(COLECAO).doc('documento-com-todos-os-tipos');
    await doc.set(original);

    const filho = { nome: 'item de subcoleção', quando: admin.firestore.Timestamp.now() };
    await doc.collection(SUBCOLECAO).doc('filho-1').set(filho);

    ok('1 documento com 14 campos de tipos diferentes + 1 em subcoleção');

    // ── 2. backup pelo comando de verdade ──────────────────────────────────
    console.log('\n--- Roda `tools/backup.js`, o comando real ---');
    execFileSync(process.execPath, ['tools/backup.js', '--out', arquivo], {
      cwd: raiz,
      env: { ...process.env, ALVO: 'staging' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const dump = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    const noDump = dump.colecoes?.[COLECAO] || [];

    if (noDump.length === 1) ok('o documento está no dump');
    else falha(`o dump tem ${noDump.length} documento(s) na coleção do ensaio`);

    if (noDump[0]?.subcolecoes?.[SUBCOLECAO]?.length === 1) ok('a subcoleção está no dump');
    else falha('a subcoleção NÃO entrou no dump — restauração perderia o que está abaixo do documento');

    // ── 3. APAGA ───────────────────────────────────────────────────────────
    console.log('\n--- Apaga tudo (é aqui que o backup passa a ser a única cópia) ---');
    await apagarColecao(db.collection(COLECAO));

    const sumiu = await db.collection(COLECAO).get();
    if (sumiu.empty) ok('coleção vazia, como depois de um acidente');
    else falha('sobrou documento — o teste não vale');

    // ── 4. restaura pelo comando de verdade ────────────────────────────────
    console.log('\n--- Roda `tools/restore.js --confirmar` ---');

    // Simulação primeiro: ela não pode gravar nada.
    execFileSync(process.execPath, ['tools/restore.js', arquivo], {
      cwd: raiz, env: { ...process.env, ALVO: 'staging' }, stdio: ['ignore', 'pipe', 'pipe'],
    });

    const aindaVazio = await db.collection(COLECAO).get();
    if (aindaVazio.empty) ok('a simulação (sem --confirmar) não gravou nada');
    else falha('a SIMULAÇÃO gravou no banco — o modo seguro não é seguro');

    execFileSync(process.execPath, ['tools/restore.js', arquivo, '--confirmar'], {
      cwd: raiz, env: { ...process.env, ALVO: 'staging' }, stdio: ['ignore', 'pipe', 'pipe'],
    });

    // ── 5. confere campo por campo ─────────────────────────────────────────
    console.log('\n--- O que voltou é o que foi? ---');

    const voltou = await doc.get();
    if (!voltou.exists) {
      falha('o documento NÃO voltou');
    } else {
      ok('o documento voltou, com o mesmo id');

      const dados = voltou.data();
      const errados = [];

      for (const campo of Object.keys(original)) {
        if (!iguais(original[campo], dados[campo])) {
          errados.push(`${campo} (${JSON.stringify(canonico(original[campo]))} -> ${JSON.stringify(canonico(dados[campo]))})`);
        }
      }

      if (!errados.length) {
        ok(`os ${Object.keys(original).length} campos voltaram idênticos, tipo por tipo`);
      } else {
        falha(`${errados.length} campo(s) voltaram diferentes:`);
        for (const e of errados) console.log(`            ${e}`);
      }

      const camposASobrar = Object.keys(dados).filter((c) => !(c in original));
      if (!camposASobrar.length) ok('nenhum campo inventado na volta');
      else falha(`campo(s) que não existiam: ${camposASobrar.join(', ')}`);
    }

    const filhoVoltou = await doc.collection(SUBCOLECAO).doc('filho-1').get();
    if (filhoVoltou.exists && iguais(filho.nome, filhoVoltou.data().nome)) {
      ok('a subcoleção voltou junto');
    } else {
      falha('a subcoleção NÃO voltou — dado abaixo do documento se perderia');
    }
  } finally {
    console.log('\n--- Limpeza ---');
    await apagarColecao(db.collection(COLECAO));
    fs.rmSync(pasta, { recursive: true, force: true });
    ok('coleção do ensaio e arquivo temporário apagados');
  }

  console.log('\n' + '='.repeat(66));
  if (problemas) {
    console.log(`${problemas} problema(s). O CAMINHO backup.js -> restore.js NÃO É CONFIÁVEL.`);
    process.exit(1);
  }
  console.log('Ensaio de restauração completo: o que foi apagado voltou igual.');
  console.log('='.repeat(66) + '\n');
  process.exit(0);
})().catch((e) => { console.error('\nFalhou:', e.message, '\n'); process.exit(1); });
