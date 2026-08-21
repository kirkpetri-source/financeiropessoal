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

const { ALVO } = require('./carregarAmbiente');

if (ALVO !== 'staging') {
  console.error('Este teste só roda em homologação. Use:');
  console.error('  ALVO=staging node tools/testar-chamados-ponta-a-ponta.js');
  process.exit(1);
}

const { db } = require('../src/config/firebaseAdmin');
const { escopoDe } = require('../src/data/escopo');
const householdService = require('../src/services/householdService');
const lgpdService = require('../src/services/lgpdService');
const chamadoService = require('../src/services/chamadoService');
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

    console.log('\n8) Numeração sob CONTENÇÃO — o que o dublê não prova');
    const QUANTOS = 8;
    const familiasParalelas = [];
    for (let i = 0; i < QUANTOS; i++) familiasParalelas.push(await criarFamilia(`P${i}`));

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

    for (const id of familiasParalelas) await lgpdService.apagarHousehold(id);
  } finally {
    console.log('\nLimpando...');
    await lgpdService.apagarHousehold(familiaA).catch(() => {});
    await lgpdService.apagarHousehold(familiaB).catch(() => {});

    // apagarHousehold ainda não varre supportTickets (é a Fase 7 do plano);
    // até lá, o teste limpa o que criou para não deixar rastro em homologação.
    for (const numero of abertos) {
      await db.collection('supportTickets').doc(String(numero)).delete().catch(() => {});
    }
    console.log(`  ${abertos.length} chamados e as famílias removidos.`);
  }

  console.log(`\n${verificacoes - falhas}/${verificacoes} verificações passaram.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nFalhou:', err.message);
  console.error(err.stack);
  process.exit(1);
});
