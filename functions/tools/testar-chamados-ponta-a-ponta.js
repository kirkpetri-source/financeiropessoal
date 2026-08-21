#!/usr/bin/env node
/**
 * Teste ponta a ponta dos chamados de suporte, contra o Firestore de verdade.
 *
 *   ALVO=staging node tools/testar-chamados-ponta-a-ponta.js
 *
 * Só roda em HOMOLOGAÇÃO (regra 17), e recusa produção — cria e apaga famílias
 * descartáveis, e o teto de chamados abertos é por família, então um teste que
 * escapasse para produção deixaria lixo na conta de alguém.
 *
 * Existe porque o dublê de banco dos testes de unidade NÃO reproduz o que mais
 * pode dar errado aqui:
 *
 *   - `.select()` de verdade, que o Firestore serve por índice;
 *   - `create()` recusando id existente, que é a segunda trava da numeração;
 *   - `arrayUnion` com um objeto que tem `Timestamp` dentro (e a proibição de
 *     `serverTimestamp()` dentro de array, que só aparece no servidor);
 *   - a ordem "ler tudo antes de escrever" da transação;
 *   - **contenção**: o dublê executa em série, então numeração atômica só se
 *     prova disparando aberturas de verdade ao mesmo tempo.
 *
 * Cresce junto com o plano: por enquanto cobre a Fase 2 (abrir, responder,
 * resolver, reabrir, isolamento e numeração concorrente). Anexo, fila do
 * operador e notificação entram quando existirem.
 */

const { carregar, ALVO } = require('./carregarAmbiente');

if (ALVO !== 'staging') {
  console.error('Este teste só roda em homologação. Use:');
  console.error('  ALVO=staging node tools/testar-chamados-ponta-a-ponta.js');
  process.exit(1);
}

// Sem isto, o `.env.<projeto>` não é lido e o teste falha lá na frente, no
// meio dos anexos, com "STORAGE_BUCKET_ANEXOS não configurado" — depois de já
// ter criado família e chamado. Importar só o ALVO não carrega nada.
carregar();

if (!process.env.STORAGE_BUCKET_ANEXOS) {
  console.error('STORAGE_BUCKET_ANEXOS ausente no .env de homologação — os anexos não teriam onde ir.');
  process.exit(1);
}

const { db } = require('../src/config/firebaseAdmin');
const { escopoDe } = require('../src/data/escopo');
const householdService = require('../src/services/householdService');
const lgpdService = require('../src/services/lgpdService');
const chamadoService = require('../src/services/chamadoService');
const anexoService = require('../src/services/anexoService');
const plataforma = require('../src/services/chamadosPlataformaService');
const { STATUS, AUTORES, MOTIVOS_RESOLUCAO, LIMITES, DIAS_PARA_REABRIR } = require('../src/chamados/estado');

let verificacoes = 0;
let falhas = 0;

function conferir(rotulo, condicao, detalhe = '') {
  verificacoes += 1;
  if (condicao) {
    console.log(`  [ok]    ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`);
  } else {
    falhas += 1;
    console.log(`  [FALHA] ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

async function criarFamilia(sufixo) {
  const familia = await householdService.criarHousehold({
    nome: `TESTE-CHAMADOS-${sufixo}`,
    ownerId: `teste-chamados-${sufixo}-${Date.now()}`,
    ownerNome: 'Teste Automatizado',
    ownerEmail: `teste-chamados-${sufixo}@example.invalid`,
  });
  return familia.id;
}

// Operadores descartáveis da seção 10. Nomes fixos para a limpeza alcançá-los
// mesmo quando o teste morre no meio.
const OP_ATIVO = 'operador-de-teste-ativo';
const OP_DESLIGADO = 'operador-de-teste-desligado';

const ABERTURA = {
  assunto: 'não consigo importar o extrato',
  categoria: 'PROBLEMA',
  texto: 'subo o OFX e não acontece nada na tela',
  autorNome: 'Teste',
  abertoPor: { uid: 'uid-de-teste', nome: 'Teste' },
};

async function main() {
  console.log('Teste ponta a ponta — chamados de suporte (homologação, famílias descartáveis)\n');

  const familiaA = await criarFamilia('A');
  const familiaB = await criarFamilia('B');
  const dadosA = escopoDe(familiaA);
  const dadosB = escopoDe(familiaB);

  console.log(`  família A: ${familiaA}`);
  console.log(`  família B: ${familiaB}\n`);

  const abertos = [];
  // Toda família criada no meio do teste entra aqui na hora em que nasce. A
  // limpeza no `finally` varre esta lista — na primeira versão, uma família
  // criada no meio de uma seção que falhou depois ficou órfã em homologação,
  // porque só A e B eram apagadas.
  const familias = [familiaA, familiaB];

  try {
    console.log('1) Abertura e numeração');
    const primeiro = await chamadoService.abrirChamado(dadosA, ABERTURA);
    abertos.push(primeiro.numero);
    conferir('chamado abre e recebe número', Number.isInteger(primeiro.numero), `#${primeiro.numero}`);

    const doc = await db.collection('supportTickets').doc(String(primeiro.numero)).get();
    conferir('o id do documento é o número', doc.exists);
    conferir('householdId carimbado', doc.data().householdId === familiaA);
    conferir('nasce ABERTO', doc.data().status === STATUS.ABERTO);
    conferir('primeira mensagem gravada', (doc.data().mensagens || []).length === 1);
    conferir(
      'a data da mensagem sobreviveu dentro do array',
      typeof doc.data().mensagens[0].em?.toDate === 'function',
      'serverTimestamp() dentro de array seria recusado pelo Firestore',
    );

    console.log('\n2) Resposta do suporte e do cliente');
    await chamadoService.responder(dadosA, primeiro.numero, {
      autor: AUTORES.SUPORTE, autorNome: 'Suporte', texto: 'De qual banco é o extrato?',
    });

    let atual = await chamadoService.buscarChamado(dadosA, primeiro.numero);
    conferir('operador respondeu: AGUARDANDO_CLIENTE', atual.status === STATUS.AGUARDANDO_CLIENTE);
    conferir('espera zerada', atual.aguardandoOperadorDesde === null);
    conferir('indicador do cliente aceso', atual.naoLidoPeloCliente === true);
    conferir('indicador do operador apagado', atual.naoLidoPeloOperador === false);
    conferir('arrayUnion preservou a mensagem anterior', atual.mensagens.length === 2);
    conferir('contagem acompanhou', atual.quantidadeMensagens === 2);

    await chamadoService.responder(dadosA, primeiro.numero, {
      autor: AUTORES.CLIENTE, autorNome: 'Teste', texto: 'Itaú',
    });

    atual = await chamadoService.buscarChamado(dadosA, primeiro.numero);
    conferir('cliente respondeu: EM_ANDAMENTO', atual.status === STATUS.EM_ANDAMENTO);
    conferir('espera pelo suporte recomeçou', !!atual.aguardandoOperadorDesde);
    conferir('três mensagens, na ordem', atual.mensagens.map((m) => m.texto).join('|').endsWith('Itaú'));

    console.log('\n3) Listagem sem baixar as mensagens');
    const lista = await chamadoService.listarChamados(dadosA);
    conferir('lista traz o chamado', lista.length === 1);
    conferir(
      'a lista NÃO traz o array de mensagens',
      lista[0].mensagens === undefined,
      '.select() de verdade, servido pelo Firestore',
    );
    conferir('datas saem em ISO', typeof lista[0].ultimaMensagemEm === 'string');

    console.log('\n4) Resolver e reabrir dentro da janela');
    await chamadoService.resolver(dadosA, primeiro.numero, {
      motivo: MOTIVOS_RESOLUCAO.OPERADOR, porQuem: 'uid-do-operador',
    });

    atual = await chamadoService.buscarChamado(dadosA, primeiro.numero);
    conferir('resolvido com motivo e autor', atual.motivoResolucao === MOTIVOS_RESOLUCAO.OPERADOR
      && atual.resolvidoPor === 'uid-do-operador');
    conferir('saiu da fila de espera', atual.aguardandoOperadorDesde === null);

    const reaberto = await chamadoService.responder(dadosA, primeiro.numero, {
      autor: AUTORES.CLIENTE, texto: 'voltou a acontecer',
    });
    conferir('resposta reabre o MESMO chamado', reaberto.chamadoNovo === false);

    atual = await chamadoService.buscarChamado(dadosA, primeiro.numero);
    conferir('voltou para EM_ANDAMENTO', atual.status === STATUS.EM_ANDAMENTO);
    conferir('campos de resolução limpos', atual.resolvidoEm === null && atual.motivoResolucao === null);

    console.log('\n5) Reabertura FORA da janela vira chamado novo');
    const antigo = new Date(Date.now() - (DIAS_PARA_REABRIR + 5) * 24 * 60 * 60 * 1000);
    await chamadoService.resolver(dadosA, primeiro.numero, {
      motivo: MOTIVOS_RESOLUCAO.OPERADOR, porQuem: 'uid-do-operador',
    }, antigo);

    const novo = await chamadoService.responder(dadosA, primeiro.numero, {
      autor: AUTORES.CLIENTE, texto: 'de novo, meses depois', abertoPor: ABERTURA.abertoPor,
    });
    abertos.push(novo.numero);

    conferir('abriu chamado novo', novo.chamadoNovo === true, `#${novo.numero}`);
    conferir('aponta para o anterior', novo.reaberturaDe === primeiro.numero);

    const antigoDepois = await chamadoService.buscarChamado(dadosA, primeiro.numero);
    conferir('o antigo continua resolvido', antigoDepois.status === STATUS.RESOLVIDO);

    console.log('\n6) Isolamento entre famílias');
    conferir('B não lê o chamado de A', (await chamadoService.buscarChamado(dadosB, primeiro.numero)) === null);
    conferir('B não vê nada na lista', (await chamadoService.listarChamados(dadosB)).length === 0);

    let recusou = false;
    await chamadoService.responder(dadosB, primeiro.numero, { autor: AUTORES.CLIENTE, texto: 'invadindo' })
      .catch((e) => { recusou = e.statusCode === 404; });
    conferir('B não responde ao chamado de A', recusou);

    recusou = false;
    await chamadoService.resolver(dadosB, primeiro.numero, {
      motivo: MOTIVOS_RESOLUCAO.OPERADOR, porQuem: 'uid',
    }).catch((e) => { recusou = e.statusCode === 404; });
    conferir('B não resolve o chamado de A', recusou);

    console.log('\n7) Teto de chamados abertos, por família');
    const emAberto = (await chamadoService.listarChamados(dadosA))
      .filter((c) => c.status !== STATUS.RESOLVIDO).length;

    for (let i = emAberto; i < LIMITES.CHAMADOS_ABERTOS_POR_FAMILIA; i++) {
      const extra = await chamadoService.abrirChamado(dadosA, ABERTURA);
      abertos.push(extra.numero);
    }

    let barrou = false;
    await chamadoService.abrirChamado(dadosA, ABERTURA)
      .catch((e) => { barrou = e.codigo === 'CHAMADOS_DEMAIS'; });
    conferir(`barra o ${LIMITES.CHAMADOS_ABERTOS_POR_FAMILIA + 1}º chamado aberto`, barrou);

    const daB = await chamadoService.abrirChamado(dadosB, ABERTURA);
    abertos.push(daB.numero);
    conferir('a família B não é afetada pelo teto da A', Number.isInteger(daB.numero));

    console.log('\n8) Anexos, contra o bucket de verdade');
    const familiaC = await criarFamilia('C');
    familias.push(familiaC);
    const dadosC = escopoDe(familiaC);

    const PNG = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('conteudo de imagem de teste'),
    ]);
    const PDF = Buffer.from('%PDF-1.7\nextrato de teste\n');
    const EXECUTAVEL = Buffer.from('MZ\x90\x00 isto e um programa');

    const upload = await anexoService.subirArquivos(familiaC, [
      { nomeOriginal: 'print da tela.png', conteudo: PNG.toString('base64') },
      { nomeOriginal: 'extrato.pdf', conteudo: PDF.toString('base64') },
      { nomeOriginal: 'virus.png', conteudo: EXECUTAVEL.toString('base64') },
    ]);

    conferir('dois arquivos válidos subiram', upload.enviados.length === 2);
    conferir('o executável disfarçado foi recusado', upload.falharam.length === 1
      && upload.falharam[0].codigo === 'TIPO_NAO_ACEITO');
    conferir(
      'falha parcial não derrubou os bons',
      upload.enviados.some((a) => a.mimeType === 'image/png')
      && upload.enviados.some((a) => a.mimeType === 'application/pdf'),
    );
    conferir(
      'o nome interno é aleatório, dentro da pasta da família',
      upload.enviados.every((a) => /^chamados\/[^/]+\/[0-9a-f]{32}\.(png|pdf)$/.test(a.storagePath)),
    );

    const comAnexo = await chamadoService.abrirChamado(dadosC, {
      ...ABERTURA,
      anexos: await anexoService.metadadosDe(familiaC, upload.enviados.map((a) => a.storagePath)),
    });
    abertos.push(comAnexo.numero);

    const chamadoComAnexo = await chamadoService.buscarChamado(dadosC, comAnexo.numero);
    const anexosGravados = chamadoComAnexo.mensagens[0].anexos;
    conferir('a mensagem cita os dois anexos', anexosGravados.length === 2);
    conferir(
      'os metadados foram RELIDOS do Storage, não copiados do cliente',
      anexosGravados.some((a) => a.nomeOriginal === 'print da tela.png' && a.tamanho === PNG.length),
    );

    const lido = await anexoService.lerAnexo(familiaC, anexosGravados
      .find((a) => a.mimeType === 'application/pdf').storagePath);
    conferir('a leitura devolve os bytes originais', lido.conteudo.equals(PDF));
    conferir('e o nome de exibição', lido.nomeOriginal === 'extrato.pdf');

    let negou = false;
    await anexoService.lerAnexo(familiaA, anexosGravados[0].storagePath)
      .catch((e) => { negou = e.statusCode === 404; });
    conferir('outra família não lê o anexo, mesmo com o caminho na mão', negou);

    negou = false;
    await anexoService.metadadosDe(familiaA, [anexosGravados[0].storagePath])
      .catch((e) => { negou = e.codigo === 'ANEXO_INVALIDO'; });
    conferir('nem consegue CITAR o anexo alheio numa mensagem própria', negou);

    negou = false;
    await anexoService.metadadosDe(familiaC, [`chamados/${familiaC}/${'a'.repeat(32)}.png`])
      .catch((e) => { negou = e.codigo === 'ANEXO_INVALIDO'; });
    conferir('não dá para citar arquivo que não existe', negou);

    await anexoService.apagarDaFamilia(familiaC);
    let sumiu = false;
    await anexoService.lerAnexo(familiaC, anexosGravados[0].storagePath)
      .catch((e) => { sumiu = e.statusCode === 404; });
    conferir('apagarDaFamilia limpa o prefixo inteiro', sumiu);

    await lgpdService.apagarHousehold(familiaC);

    console.log('\n9) Numeração sob CONTENÇÃO — o que o dublê não prova');
    const QUANTOS = 8;
    const familiasParalelas = [];
    for (let i = 0; i < QUANTOS; i++) {
      const id = await criarFamilia(`P${i}`);
      familiasParalelas.push(id);
      familias.push(id);
    }

    const antesDoContador = (await db.collection('counters').doc('supportTickets').get()).data().ultimo;

    const simultaneos = await Promise.all(
      familiasParalelas.map((id) => chamadoService.abrirChamado(escopoDe(id), ABERTURA)),
    );
    const numeros = simultaneos.map((r) => r.numero);
    simultaneos.forEach((r) => abertos.push(r.numero));

    conferir(
      `${QUANTOS} aberturas simultâneas geram ${QUANTOS} números distintos`,
      new Set(numeros).size === QUANTOS,
      numeros.join(', '),
    );

    const depoisDoContador = (await db.collection('counters').doc('supportTickets').get()).data().ultimo;
    conferir(
      'o contador andou exatamente o número de chamados',
      depoisDoContador - antesDoContador === QUANTOS,
      `${antesDoContador} -> ${depoisDoContador}`,
    );
    conferir('nenhum número foi pulado', Math.max(...numeros) === depoisDoContador);

    console.log('\n10) Fila do operador — consultas cross-tenant contra o Firestore');
    await db.collection('operadores').doc(OP_ATIVO).set({ uid: OP_ATIVO, nome: 'Alfa', papel: 'ADMIN', ativo: true });
    await db.collection('operadores').doc(OP_DESLIGADO).set({ uid: OP_DESLIGADO, nome: 'Beta', papel: 'ATENDENTE', ativo: false });

    const ativos = await plataforma.listarOperadoresAtivos();
    conferir(
      'listarOperadoresAtivos traz o ativo e deixa o desligado de fora',
      ativos.some((o) => o.uid === OP_ATIVO) && !ativos.some((o) => o.uid === OP_DESLIGADO),
    );

    const filaToda = await plataforma.listarFila();
    conferir('a fila enxerga famílias diferentes', filaToda.total >= 2, `${filaToda.total} chamados`);
    conferir(
      'e NÃO baixa o array de mensagens',
      filaToda.chamados.every((c) => c.mensagens === undefined),
      '.select() cross-tenant',
    );

    // `where` + `select` é onde o painel gestor já quebrou por falta de índice
    // composto: passa limpo no dublê e estoura com FAILED_PRECONDITION aqui.
    const soAbertos = await plataforma.listarFila({ status: STATUS.ABERTO });
    conferir(
      'filtrar por status não exige índice composto',
      soAbertos.chamados.every((c) => c.status === STATUS.ABERTO),
      `${soAbertos.chamados.length} em ABERTO`,
    );

    const alvo = filaToda.chamados.find((c) => c.status !== STATUS.RESOLVIDO);
    const OPERADOR = { uid: OP_ATIVO, nome: 'Alfa' };

    await plataforma.encaminhar(alvo.numero, OP_ATIVO, OPERADOR);
    conferir(
      'encaminhar grava o responsável',
      (await plataforma.buscarPorNumero(alvo.numero)).atribuidoA === OP_ATIVO,
    );

    let recusouDestino = false;
    await plataforma.encaminhar(alvo.numero, OP_DESLIGADO, OPERADOR)
      .catch((e) => { recusouDestino = e.codigo === 'DESTINATARIO_INVALIDO'; });
    conferir('e recusa encaminhar para operador desligado', recusouDestino);

    await plataforma.responderComoSuporte(alvo.numero, { texto: 'resposta do suporte' }, OPERADOR);
    const respondido = await plataforma.buscarPorNumero(alvo.numero);
    conferir('operador responde e a espera zera', respondido.aguardandoOperadorDesde === null);
    conferir('a mensagem sai com o nome do operador', respondido.mensagens.at(-1).autorNome === 'Alfa');

    // A varredura usa `where` + `select` + `limit`. Mesmo risco de índice.
    const vencidos = await plataforma.vencidosPorInatividade(new Date());
    conferir(
      'a varredura de inatividade roda sem índice composto',
      Array.isArray(vencidos),
      `${vencidos.length} vencido(s) hoje`,
    );

    const auditados = await db.collection('adminAuditLog')
      .where('householdId', '==', alvo.householdId).get();
    conferir('as ações do operador ficaram no adminAuditLog', auditados.size >= 2, `${auditados.size} registros`);

    await plataforma.resolverComoOperador(alvo.numero, OPERADOR);
    conferir(
      'resolver pelo painel marca motivo OPERADOR',
      (await plataforma.buscarPorNumero(alvo.numero)).motivoResolucao === MOTIVOS_RESOLUCAO.OPERADOR,
    );
  } finally {
    console.log('\nLimpando...');

    // Varre a lista de TUDO que foi criado, e não só A e B. Na primeira versão
    // era só A e B: uma família criada no meio de uma seção que falhou depois
    // ficou órfã em homologação, e só apareceu ao conferir a coleção na mão.
    for (const id of familias) {
      await anexoService.apagarDaFamilia(id).catch(() => {});
      await lgpdService.apagarHousehold(id).catch(() => {});
    }
    for (const numero of abertos) {
      await db.collection('supportTickets').doc(String(numero)).delete().catch(() => {});
    }
    for (const uid of [OP_ATIVO, OP_DESLIGADO]) {
      await db.collection('operadores').doc(uid).delete().catch(() => {});
    }

    // O rastro é apagado AQUI, e não no meio do teste: a versão anterior
    // limpava antes de resolver o chamado, e a ação seguinte gravava um
    // registro novo que ficava para trás. Só apareceu conferindo a coleção.
    let rastros = 0;
    for (const id of familias) {
      const snap = await db.collection('adminAuditLog').where('householdId', '==', id).get();
      for (const d of snap.docs) { await d.ref.delete(); rastros += 1; }
    }

    console.log(`  ${familias.length} famílias, ${abertos.length} chamados, 2 operadores e ${rastros} registros de auditoria removidos.`);
  }

  console.log(`\n${verificacoes - falhas}/${verificacoes} verificações passaram.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nFalhou:', err.message);
  console.error(err.stack);
  process.exit(1);
});
