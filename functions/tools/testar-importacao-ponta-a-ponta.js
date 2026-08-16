#!/usr/bin/env node
/**
 * Testa a importação de extrato de ponta a ponta, contra o Firestore REAL,
 * numa família descartável criada e apagada pelo próprio script.
 *
 *   node tools/testar-importacao-ponta-a-ponta.js
 *   node tools/testar-importacao-ponta-a-ponta.js --manter   # não apaga no fim
 *
 * Existe porque o emulador local não serve para isto: escrita quebra sob Node
 * 24 (ver "Armadilhas já pagas"), e é justamente a ESCRITA que precisa ser
 * verificada aqui — a trava contra duplicidade é o `create()` do Firestore
 * recusando ID repetido, comportamento que dublê nenhum prova.
 *
 * Nunca toca em família real: cria a dela, faz tudo dentro, e apaga.
 */

const { carregar } = require('./carregarAmbiente');

carregar([]);

const householdService = require('../src/services/householdService');
const importacaoService = require('../src/services/importacaoService');
const { escopoDe } = require('../src/data/escopo');
const { ultimoMesFechado, mesCorrente } = require('../src/importacao/janela');

const manter = process.argv.includes('--manter');

function mesesDeTeste() {
  const fechado = ultimoMesFechado();          // ex.: 2026-07
  const corrente = mesCorrente();              // ex.: 2026-08
  const [ano, mes] = fechado.split('-').map(Number);
  const anterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, '0')}`;
  return { fechado, anterior, corrente };
}

/** OFX mínimo, no formato que os bancos brasileiros exportam. */
function montarOfx(linhas) {
  const corpo = linhas.map((l) => `<STMTTRN><TRNTYPE>${l.valor < 0 ? 'DEBIT' : 'CREDIT'}<DTPOSTED>${l.data.replace(/-/g, '')}<TRNAMT>${l.valor.toFixed(2)}<FITID>${l.id}<MEMO>${l.memo}</STMTTRN>`).join('\n');
  return `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>\n${corpo}\n</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
}

const passos = [];
function checar(descricao, condicao, detalhe = '') {
  passos.push({ descricao, ok: !!condicao, detalhe });
  console.log(`  ${condicao ? 'OK  ' : 'FALHOU'}  ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
}

async function main() {
  const { fechado, anterior, corrente } = mesesDeTeste();
  console.log(`Importação de extrato — teste ponta a ponta`);
  console.log(`Mês corrente (bloqueado): ${corrente} | último fechado: ${fechado}\n`);

  const uid = `teste-import-${Date.now()}`;
  const familia = await householdService.criarHousehold({
    nome: '[TESTE] Importação',
    ownerId: uid,
    ownerNome: 'Teste Importação',
    ownerEmail: 'teste-importacao@exemplo.com',
    ownerTelefone: '5511912345678',
  });
  const householdId = familia.id;
  console.log(`família descartável: ${householdId}\n`);

  const dados = escopoDe(householdId);

  try {
    // ---------------------------------------------------------------- 1. ler
    const ofx = montarOfx([
      { id: 'T1', data: `${fechado}-05`, valor: -84.9, memo: 'COMPRA NO DEBITO - SUPERMERCADO BOM PRECO' },
      { id: 'T2', data: `${fechado}-12`, valor: -150.0, memo: 'POSTO IPIRANGA' },
      { id: 'T3', data: `${fechado}-15`, valor: 3200.0, memo: 'SALARIO EMPRESA LTDA' },
      { id: 'T4', data: `${anterior}-20`, valor: -40.0, memo: 'PADARIA CENTRAL' },
      { id: 'T5', data: `${corrente}-10`, valor: -99.0, memo: 'FARMACIA SAO JOAO' },
    ]);

    console.log('1) análise do arquivo');
    const preview = await importacaoService.analisar({
      householdId, conteudo: ofx, nomeArquivo: 'extrato-teste.ofx', criadoPor: uid,
    });

    checar('mês corrente ficou de fora', preview.linhas.length === 4, `${preview.linhas.length} linhas aceitas`);
    checar('recusa explicada ao usuário', preview.recusadas?.porMotivo?.MES_CORRENTE === 1);
    checar('nenhuma marcada como já importada', preview.jaImportadas === 0);
    checar('resumo por mês montado', preview.meses.length === 2, preview.meses.map((m) => m.mes).join(', '));

    // ----------------------------------------------------------- 2. confirmar
    console.log('\n2) confirmação');
    const escolhas = preview.linhas.map((_, indice) => ({ indice }));
    const r1 = await importacaoService.confirmar({ householdId, batchId: preview.id, escolhas, criadoPor: uid });
    checar('4 lançamentos gravados', r1.totalCriadas === 4, `criadas=${r1.totalCriadas} puladas=${r1.totalPuladas}`);

    const snap1 = await dados.consultar('transactions').get();
    checar('lançamentos existem no Firestore', snap1.size === 4, `${snap1.size} documentos`);
    const primeira = snap1.docs[0].data();
    checar('lançamento carrega origem IMPORT', primeira.origin === 'IMPORT');
    checar('lançamento carrega digital e importId', !!primeira.digital && primeira.importId === preview.id);

    // ------------------------------------------------- 3. reimportar o mesmo
    console.log('\n3) reimportação do MESMO arquivo (a trava)');
    const preview2 = await importacaoService.analisar({
      householdId, conteudo: ofx, nomeArquivo: 'extrato-teste.ofx', criadoPor: uid,
    });
    checar('preview marca as 4 como já importadas', preview2.jaImportadas === 4);

    const r2 = await importacaoService.confirmar({
      householdId,
      batchId: preview2.id,
      escolhas: preview2.linhas.map((_, indice) => ({ indice })),
      criadoPor: uid,
    });
    checar('nada foi gravado de novo', r2.totalCriadas === 0, `puladas=${r2.totalPuladas}`);

    const snap2 = await dados.consultar('transactions').get();
    checar('total continua 4 (sem duplicata)', snap2.size === 4, `${snap2.size} documentos`);

    // --------------------------- 4. arquivo sobreposto: só o que falta entra
    console.log('\n4) extrato sobreposto (período maior, com uma linha nova)');
    const ofxMaior = montarOfx([
      { id: 'T0', data: `${anterior}-02`, valor: -25.5, memo: 'ESTACIONAMENTO CENTRO' },
      { id: 'T1', data: `${fechado}-05`, valor: -84.9, memo: 'COMPRA NO DEBITO - SUPERMERCADO BOM PRECO' },
      { id: 'T4', data: `${anterior}-20`, valor: -40.0, memo: 'PADARIA CENTRAL' },
    ]);
    const preview3 = await importacaoService.analisar({ householdId, conteudo: ofxMaior, criadoPor: uid });
    const r3 = await importacaoService.confirmar({
      householdId,
      batchId: preview3.id,
      escolhas: preview3.linhas.map((_, indice) => ({ indice })),
      criadoPor: uid,
    });
    checar('só a linha nova entrou', r3.totalCriadas === 1, `criadas=${r3.totalCriadas} puladas=${r3.totalPuladas}`);

    const snap3 = await dados.consultar('transactions').get();
    checar('total agora é 5', snap3.size === 5);

    // ------------------------------------------------------------ 5. desfazer
    console.log('\n5) desfazer');
    const desfeito = await importacaoService.desfazer({ householdId, batchId: preview.id });
    checar('desfez só o primeiro lote', desfeito.apagadas === 4, `${desfeito.apagadas} apagadas`);

    const snap4 = await dados.consultar('transactions').get();
    checar('sobrou o lançamento do outro lote', snap4.size === 1);

    // -------------------------------------------------------- 6. histórico
    console.log('\n6) histórico');
    const lotes = await importacaoService.listarLotes({ householdId });
    checar('lotes listados', lotes.length === 3, `${lotes.length} lotes`);
    checar('lote desfeito marcado', lotes.some((l) => l.status === 'desfeito'));
  } finally {
    if (manter) {
      console.log(`\nFamília MANTIDA para inspeção: ${householdId}`);
      console.log(`Apague depois com: node tools/apagar-familia.js ${householdId} --confirmar`);
    } else {
      console.log('\nlimpando a família de teste…');
      const lgpdService = require('../src/services/lgpdService');
      await lgpdService.apagarHousehold(householdId);
      const { db } = require('../src/config/firebaseAdmin');
      await db.collection('households').doc(householdId).delete();
      await db.collection('users').doc(uid).delete();
      console.log('família apagada.');
    }
  }

  const falhas = passos.filter((p) => !p.ok);
  console.log(`\n${passos.length - falhas.length}/${passos.length} verificações passaram.`);
  process.exit(falhas.length ? 1 : 0);
}

main().catch((err) => {
  console.error('\nFalhou:', err.message);
  console.error(err.stack);
  process.exit(1);
});
