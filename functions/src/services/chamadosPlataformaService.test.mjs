import { describe, it, expect, beforeEach } from 'vitest';
import { criarDuble } from '../__testes__/dubleDeBanco.mjs';
import { criarChamadosPlataformaService, TETO_DA_FILA } from './chamadosPlataformaService.js';
import { criarChamadoService } from './chamadoService.js';
import { STATUS, AUTORES, MOTIVOS_RESOLUCAO } from '../chamados/estado.js';

const FAMILIA_A = 'fam-A';
const FAMILIA_B = 'fam-B';
const AGORA = new Date('2026-08-21T12:00:00Z');
const diasAtras = (n) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000);

const KIRK = { uid: 'uid-kirk', nome: 'Kirk', papel: 'ADMIN', ativo: true };
const MARIA = { uid: 'uid-maria', nome: 'Maria', papel: 'ATENDENTE', ativo: true };
const DESLIGADO = { uid: 'uid-ex', nome: 'Ex-atendente', papel: 'ATENDENTE', ativo: false };

let duble;
let chamados;
let plataforma;
let auditoria;
let avisos;

beforeEach(() => {
  duble = criarDuble({
    'operadores/uid-kirk': KIRK,
    'operadores/uid-maria': MARIA,
    'operadores/uid-ex': DESLIGADO,
  });

  chamados = criarChamadoService({ db: duble.db, admin: duble.admin });
  auditoria = [];
  avisos = [];

  plataforma = criarChamadosPlataformaService({
    db: duble.db,
    escopoDe: duble.escopoDe,
    chamadoService: chamados,
    auditar: async (registro) => { auditoria.push(registro); },
    notificar: {
      suporteRespondeu: async (d) => { avisos.push({ evento: 'suporteRespondeu', ...d }); },
      chamadoEncaminhado: async (d) => { avisos.push({ evento: 'chamadoEncaminhado', ...d }); },
    },
  });
});

const ABERTURA = {
  assunto: 'não consigo importar o extrato',
  categoria: 'PROBLEMA',
  texto: 'subo o OFX e não acontece nada',
  abertoPor: { uid: 'uid-cliente', nome: 'Cliente' },
};

async function abrirPara(familia, quando = AGORA, extra = {}) {
  return chamados.abrirChamado(duble.escopoDe(familia), { ...ABERTURA, ...extra }, quando);
}

function doc(numero) {
  return duble.estado.documentos[`supportTickets/${numero}`];
}

describe('listarFila — enxerga todas as famílias', () => {
  it('traz chamado de famílias diferentes', async () => {
    await abrirPara(FAMILIA_A);
    await abrirPara(FAMILIA_B);

    const { chamados: fila, total } = await plataforma.listarFila();

    expect(total).toBe(2);
    expect(new Set(fila.map((c) => c.householdId))).toEqual(new Set([FAMILIA_A, FAMILIA_B]));
  });

  it('NÃO traz o array de mensagens', async () => {
    await abrirPara(FAMILIA_A);

    const { chamados: fila } = await plataforma.listarFila();

    expect(fila[0].assunto).toBe(ABERTURA.assunto);
    expect(fila[0].mensagens).toBeUndefined();
  });

  it('quem espera há mais tempo vem primeiro', async () => {
    await abrirPara(FAMILIA_A, diasAtras(1));   // #1, espera de 1 dia
    await abrirPara(FAMILIA_B, diasAtras(5));   // #2, espera de 5 dias

    const { chamados: fila } = await plataforma.listarFila();

    expect(fila.map((c) => c.numero)).toEqual([2, 1]);
  });

  it('quem já foi respondido vai para o fim, mesmo sendo o mais recente', async () => {
    await abrirPara(FAMILIA_A, diasAtras(10));  // #1 espera há 10 dias
    await abrirPara(FAMILIA_B, diasAtras(1));   // #2 espera há 1 dia

    // O operador responde o #2: a bola passa para o cliente e ele sai da fila
    // de espera. Ordenar por ultimaMensagemEm o colocaria em PRIMEIRO, que é
    // exatamente o erro que aguardandoOperadorDesde existe para evitar.
    await plataforma.responderComoSuporte(2, { texto: 'já respondi' }, KIRK, AGORA);

    const { chamados: fila } = await plataforma.listarFila();

    expect(fila.map((c) => c.numero)).toEqual([1, 2]);
  });

  it('filtra por status', async () => {
    await abrirPara(FAMILIA_A);
    await abrirPara(FAMILIA_B);
    await plataforma.resolverComoOperador(2, KIRK, AGORA);

    const abertos = await plataforma.listarFila({ status: STATUS.ABERTO });
    const resolvidos = await plataforma.listarFila({ status: STATUS.RESOLVIDO });

    expect(abertos.chamados.map((c) => c.numero)).toEqual([1]);
    expect(resolvidos.chamados.map((c) => c.numero)).toEqual([2]);
  });

  it('conta abertos e não lidos', async () => {
    await abrirPara(FAMILIA_A);
    await abrirPara(FAMILIA_B);
    await plataforma.resolverComoOperador(2, KIRK, AGORA);

    const { abertos, naoLidos, total } = await plataforma.listarFila();

    expect(total).toBe(2);
    expect(abertos).toBe(1);
    expect(naoLidos).toBe(1);
  });

  it('avisa quando trunca, em vez de mentir que a lista está completa', async () => {
    for (let i = 0; i < 3; i++) await abrirPara(`fam-${i}`);

    const { chamados: fila, total, truncada } = await plataforma.listarFila({ limite: 2 });

    expect(fila).toHaveLength(2);
    expect(total).toBe(3);
    expect(truncada).toBe(true);
  });

  it('não deixa pedir mais que o teto', async () => {
    await abrirPara(FAMILIA_A);

    const { truncada } = await plataforma.listarFila({ limite: TETO_DA_FILA + 5000 });

    expect(truncada).toBe(false);
  });

  it('datas saem em ISO', async () => {
    await abrirPara(FAMILIA_A);

    const { chamados: fila } = await plataforma.listarFila();

    expect(fila[0].criadoEm).toBe(AGORA.toISOString());
  });
});

describe('operadores', () => {
  it('lista só os ativos, em ordem alfabética', async () => {
    const lista = await plataforma.listarOperadoresAtivos();

    expect(lista.map((o) => o.nome)).toEqual(['Kirk', 'Maria']);
  });

  it('busca operador desligado — o histórico de quem atendeu não some', async () => {
    const ex = await plataforma.buscarOperador('uid-ex');

    expect(ex).toMatchObject({ nome: 'Ex-atendente', ativo: false });
  });
});

describe('responderComoSuporte', () => {
  beforeEach(async () => { await abrirPara(FAMILIA_A); });

  it('escreve no chamado da família certa', async () => {
    await plataforma.responderComoSuporte(1, { texto: 'qual banco?' }, KIRK, AGORA);

    expect(doc(1).mensagens).toHaveLength(2);
    expect(doc(1).status).toBe(STATUS.AGUARDANDO_CLIENTE);
    expect(doc(1).householdId).toBe(FAMILIA_A);
  });

  it('o nome que aparece é o do operador logado', async () => {
    await plataforma.responderComoSuporte(1, { texto: 'oi' }, MARIA, AGORA);

    const ultima = doc(1).mensagens.at(-1);
    expect(ultima.autor).toBe(AUTORES.SUPORTE);
    expect(ultima.autorNome).toBe('Maria');
  });

  it('grava rastro em adminAuditLog', async () => {
    await plataforma.responderComoSuporte(1, { texto: 'oi' }, KIRK, AGORA);

    expect(auditoria).toEqual([expect.objectContaining({
      acao: 'CHAMADO_RESPONDIDO', adminUid: 'uid-kirk', householdId: FAMILIA_A,
      detalhes: { numero: 1 },
    })]);
  });

  it('404 em chamado que não existe', async () => {
    await expect(plataforma.responderComoSuporte(999, { texto: 'oi' }, KIRK, AGORA))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('avisa o dono da conta, com o uid de quem abriu', async () => {
    await plataforma.responderComoSuporte(1, { texto: 'oi' }, KIRK, AGORA);

    expect(avisos).toEqual([{
      evento: 'suporteRespondeu', numero: 1, householdId: FAMILIA_A, ownerId: 'uid-cliente',
    }]);
  });

  it('avisa DEPOIS de gravar — nunca antes', async () => {
    let mensagensQuandoAvisou = null;
    plataforma = criarChamadosPlataformaService({
      db: duble.db,
      escopoDe: duble.escopoDe,
      chamadoService: chamados,
      auditar: async () => {},
      notificar: {
        suporteRespondeu: async () => { mensagensQuandoAvisou = doc(1).mensagens.length; },
        chamadoEncaminhado: async () => {},
      },
    });

    await plataforma.responderComoSuporte(1, { texto: 'oi' }, KIRK, AGORA);

    // Envio externo antes da persistência é o jeito de avisar sobre uma
    // resposta que não existe — e, dentro de transação, de perder a escrita.
    expect(mensagensQuandoAvisou).toBe(2);
  });

  it('chamado que não existe não gera aviso nenhum', async () => {
    await plataforma.responderComoSuporte(999, { texto: 'oi' }, KIRK, AGORA).catch(() => {});

    expect(avisos).toEqual([]);
  });
});

describe('encaminhar', () => {
  beforeEach(async () => { await abrirPara(FAMILIA_A); });

  it('atribui a um operador ativo', async () => {
    const r = await plataforma.encaminhar(1, 'uid-maria', KIRK);

    expect(doc(1).atribuidoA).toBe('uid-maria');
    expect(doc(1).atribuidoEm).toBeTruthy();
    expect(r.paraNome).toBe('Maria');
  });

  it('RECUSA encaminhar para operador desligado', async () => {
    await expect(plataforma.encaminhar(1, 'uid-ex', KIRK))
      .rejects.toMatchObject({ statusCode: 400, codigo: 'DESTINATARIO_INVALIDO' });

    expect(doc(1).atribuidoA).toBeNull();
  });

  it('RECUSA uid que não é operador nenhum', async () => {
    await expect(plataforma.encaminhar(1, 'uid-de-um-cliente', KIRK))
      .rejects.toMatchObject({ codigo: 'DESTINATARIO_INVALIDO' });

    expect(doc(1).atribuidoA).toBeNull();
  });

  it('confere o destinatário ANTES de tocar no chamado', async () => {
    // Se a ordem fosse a inversa, um encaminhamento inválido ainda carimbaria
    // updatedAt e apareceria como mexida no histórico do cliente.
    const antes = doc(1).updatedAt;

    await plataforma.encaminhar(1, 'uid-ex', KIRK).catch(() => {});

    expect(doc(1).updatedAt).toBe(antes);
  });

  it('grava rastro', async () => {
    await plataforma.encaminhar(1, 'uid-maria', KIRK);

    expect(auditoria[0]).toMatchObject({
      acao: 'CHAMADO_ENCAMINHADO',
      detalhes: { numero: 1, para: 'uid-maria', paraNome: 'Maria' },
    });
  });

  it('avisa o novo responsável, com nome e e-mail real', async () => {
    duble.estado.documentos['operadores/uid-maria'] = { ...MARIA, email: 'maria@empresa.com' };

    await plataforma.encaminhar(1, 'uid-maria', KIRK);

    expect(avisos).toEqual([{
      evento: 'chamadoEncaminhado', numero: 1, householdId: FAMILIA_A,
      para: { nome: 'Maria', email: 'maria@empresa.com' },
    }]);
  });

  it('operador sem e-mail real vira email null — quem decide o destino é o notificador', async () => {
    await plataforma.encaminhar(1, 'uid-maria', KIRK);

    expect(avisos[0].para).toEqual({ nome: 'Maria', email: null });
  });

  it('encaminhamento recusado não avisa ninguém', async () => {
    await plataforma.encaminhar(1, 'uid-ex', KIRK).catch(() => {});

    expect(avisos).toEqual([]);
  });

  it('encaminhar de novo para o mesmo não reescreve', async () => {
    await plataforma.encaminhar(1, 'uid-maria', KIRK);
    duble.estado.documentos['supportTickets/1'].updatedAt = 'marca';

    await plataforma.encaminhar(1, 'uid-maria', KIRK);

    expect(doc(1).updatedAt).toBe('marca');
  });
});

describe('resolverComoOperador', () => {
  beforeEach(async () => { await abrirPara(FAMILIA_A); });

  it('resolve com motivo OPERADOR e o uid de quem resolveu', async () => {
    await plataforma.resolverComoOperador(1, MARIA, AGORA);

    expect(doc(1)).toMatchObject({
      status: STATUS.RESOLVIDO,
      motivoResolucao: MOTIVOS_RESOLUCAO.OPERADOR,
      resolvidoPor: 'uid-maria',
    });
  });

  it('grava rastro', async () => {
    await plataforma.resolverComoOperador(1, MARIA, AGORA);

    expect(auditoria[0]).toMatchObject({ acao: 'CHAMADO_RESOLVIDO', adminUid: 'uid-maria' });
  });
});

describe('abrirChamado — a tela do operador', () => {
  beforeEach(async () => { await abrirPara(FAMILIA_A); });

  it('traz as mensagens e apaga o indicador do operador', async () => {
    const chamado = await plataforma.abrirChamado(1, KIRK);

    expect(chamado.mensagens).toHaveLength(1);
    expect(chamado.naoLidoPeloOperador).toBe(false);
    expect(doc(1).naoLidoPeloOperador).toBe(false);
  });

  it('resolve o nome de quem está atribuído', async () => {
    await plataforma.encaminhar(1, 'uid-maria', KIRK);

    const chamado = await plataforma.abrirChamado(1, KIRK);

    expect(chamado.atribuidoNome).toBe('Maria');
  });

  it('não acende o indicador do cliente por o operador ter aberto a tela', async () => {
    await plataforma.abrirChamado(1, KIRK);

    expect(doc(1).naoLidoPeloCliente).toBe(false);
  });
});

describe('vencidosPorInatividade', () => {
  it('acha só quem está parado há 15 dias esperando o cliente', async () => {
    await abrirPara(FAMILIA_A);
    await abrirPara(FAMILIA_B);

    // #1: operador respondeu há 20 dias e o cliente sumiu.
    await plataforma.responderComoSuporte(1, { texto: 'e aí?' }, KIRK, diasAtras(20));
    // #2: operador respondeu ontem.
    await plataforma.responderComoSuporte(2, { texto: 'e aí?' }, KIRK, diasAtras(1));

    const vencidos = await plataforma.vencidosPorInatividade(AGORA);

    expect(vencidos).toEqual([{ numero: 1, householdId: FAMILIA_A }]);
  });

  it('ignora chamado ABERTO por mais antigo que seja — a bola é do suporte', async () => {
    await abrirPara(FAMILIA_A, diasAtras(400));

    expect(await plataforma.vencidosPorInatividade(AGORA)).toEqual([]);
  });

  it('devolve o householdId, para quem encerra escrever escopado', async () => {
    await abrirPara(FAMILIA_A);
    await plataforma.responderComoSuporte(1, { texto: 'e aí?' }, KIRK, diasAtras(30));

    const [vencido] = await plataforma.vencidosPorInatividade(AGORA);

    expect(vencido.householdId).toBe(FAMILIA_A);
  });
});

describe('avisos que não chegaram', () => {
  beforeEach(() => {
    duble.estado.documentos['notificacoesNaoEntregues/n1'] = {
      tipo: 'CHAMADO_NOVO', numero: 1, canal: 'EMAIL',
      destinatario: 'equipe@x.com', erro: '403', resolvida: false, criadoEm: '2026-08-20',
    };
    duble.estado.documentos['notificacoesNaoEntregues/n2'] = {
      tipo: 'SUPORTE_RESPONDEU', numero: 2, canal: 'WHATSAPP',
      destinatario: '5564...', erro: 'desconectado', resolvida: false, criadoEm: '2026-08-21',
    };
    duble.estado.documentos['notificacoesNaoEntregues/n3'] = {
      tipo: 'CHAMADO_NOVO', numero: 3, canal: 'EMAIL', resolvida: true, criadoEm: '2026-08-19',
    };
  });

  it('lista só as pendentes — a tela mostra pendência, não histórico', async () => {
    const lista = await plataforma.notificacoesNaoEntregues();

    expect(lista.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
  });

  it('mais recente primeiro', async () => {
    const lista = await plataforma.notificacoesNaoEntregues();

    expect(lista[0].id).toBe('n2');
  });

  it('dar baixa marca como resolvida e guarda quem foi', async () => {
    await plataforma.resolverNotificacao('n1', KIRK);

    const doc = duble.estado.documentos['notificacoesNaoEntregues/n1'];
    expect(doc.resolvida).toBe(true);
    expect(doc.resolvidaPor).toBe('uid-kirk');
    expect(doc.resolvidaEm).toBeTruthy();
  });

  it('não APAGA o registro — a baixa é a evidência de que alguém tratou', async () => {
    await plataforma.resolverNotificacao('n1', KIRK);

    expect(duble.estado.documentos['notificacoesNaoEntregues/n1']).toBeDefined();
    expect(duble.estado.documentos['notificacoesNaoEntregues/n1'].erro).toBe('403');
  });

  it('dar baixa de novo não sobrescreve quem deu a primeira', async () => {
    await plataforma.resolverNotificacao('n1', KIRK);
    await plataforma.resolverNotificacao('n1', MARIA);

    expect(duble.estado.documentos['notificacoesNaoEntregues/n1'].resolvidaPor).toBe('uid-kirk');
  });

  it('404 em aviso que não existe', async () => {
    await expect(plataforma.resolverNotificacao('nao-existe', KIRK))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('some da lista depois da baixa', async () => {
    await plataforma.resolverNotificacao('n1', KIRK);

    expect((await plataforma.notificacoesNaoEntregues()).map((n) => n.id)).toEqual(['n2']);
  });
});

describe('resolverInativos — a varredura diária', () => {
  async function parado(familia, haQuantosDias) {
    const { numero } = await abrirPara(familia, diasAtras(haQuantosDias + 1));
    await plataforma.responderComoSuporte(numero, { texto: 'e aí?' }, KIRK, diasAtras(haQuantosDias));
    return numero;
  }

  it('encerra com motivo INATIVIDADE_CLIENTE e resolvidoPor SISTEMA', async () => {
    const numero = await parado(FAMILIA_A, 20);

    const r = await plataforma.resolverInativos(AGORA);

    expect(r).toEqual({ encontrados: 1, resolvidos: 1, falhas: 0 });
    expect(doc(numero)).toMatchObject({
      status: STATUS.RESOLVIDO,
      motivoResolucao: MOTIVOS_RESOLUCAO.INATIVIDADE_CLIENTE,
      resolvidoPor: 'SISTEMA',
      aguardandoOperadorDesde: null,
    });
  });

  it('não toca em quem está parado há menos de 15 dias', async () => {
    const recente = await parado(FAMILIA_A, 5);

    await plataforma.resolverInativos(AGORA);

    expect(doc(recente).status).toBe(STATUS.AGUARDANDO_CLIENTE);
  });

  it('não acende o indicador do cliente — não se cobra dele a própria ausência', async () => {
    const numero = await parado(FAMILIA_A, 20);

    await plataforma.resolverInativos(AGORA);

    expect(doc(numero).naoLidoPeloCliente).toBe(false);
  });

  it('encerra em famílias diferentes na mesma passada', async () => {
    await parado(FAMILIA_A, 30);
    await parado(FAMILIA_B, 40);

    expect(await plataforma.resolverInativos(AGORA))
      .toEqual({ encontrados: 2, resolvidos: 2, falhas: 0 });
  });

  it('um chamado com problema NÃO impede os outros', async () => {
    await parado(FAMILIA_A, 20);
    const segundo = await parado(FAMILIA_B, 20);

    let primeiraChamada = true;
    const chamadoServiceQuebrado = {
      ...chamados,
      resolver: async (...args) => {
        if (primeiraChamada) { primeiraChamada = false; throw new Error('documento corrompido'); }
        return chamados.resolver(...args);
      },
    };

    const comFalha = criarChamadosPlataformaService({
      db: duble.db,
      escopoDe: duble.escopoDe,
      chamadoService: chamadoServiceQuebrado,
      auditar: async () => {},
      notificar: { suporteRespondeu: async () => {}, chamadoEncaminhado: async () => {} },
    });

    const r = await comFalha.resolverInativos(AGORA);

    expect(r).toEqual({ encontrados: 2, resolvidos: 1, falhas: 1 });
    expect(doc(segundo).status).toBe(STATUS.RESOLVIDO);
  });

  it('rodar de novo não muda nada — já está resolvido', async () => {
    await parado(FAMILIA_A, 20);
    await plataforma.resolverInativos(AGORA);

    expect(await plataforma.resolverInativos(AGORA))
      .toEqual({ encontrados: 0, resolvidos: 0, falhas: 0 });
  });

  it('sem nada vencido, não escreve', async () => {
    await abrirPara(FAMILIA_A);

    expect(await plataforma.resolverInativos(AGORA))
      .toEqual({ encontrados: 0, resolvidos: 0, falhas: 0 });
  });
});
