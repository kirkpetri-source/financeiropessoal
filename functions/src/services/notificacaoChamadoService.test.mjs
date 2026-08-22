import { describe, it, expect, beforeEach } from 'vitest';
import { criarNotificacaoChamadoService, TIPOS, CANAIS } from './notificacaoChamadoService.js';

const NUMERO = 42;
const FAMILIA = 'fam-1';
const OWNER = 'uid-do-dono';
const EQUIPE = 'suporte@revelacash.invalid';

// O que NUNCA pode aparecer em aviso nenhum.
const TEXTO_DO_CLIENTE = 'meu cartão 5555 4444 foi cobrado duas vezes';
const ASSUNTO_DO_CLIENTE = 'não consigo pagar, fiquei desempregado';

let enviados;
let avisosAoOperador;
let whatsappsDaFamilia;
let falhas;
let servico;

function montar(ajustes = {}) {
  enviados = [];
  avisosAoOperador = [];
  whatsappsDaFamilia = [];
  falhas = [];

  return criarNotificacaoChamadoService({
    emailService: {
      enviar: async (msg) => {
        enviados.push(msg);
        return ajustes.emailFalha
          ? { enviado: false, motivo: 'falha-envio', erro: ajustes.emailFalha }
          : { enviado: true, id: 'e-1' };
      },
    },
    avisarOperador: async (texto, rotulo) => {
      avisosAoOperador.push({ texto, rotulo });
      return ajustes.whatsappOperadorFalha
        ? { enviado: false, motivo: 'falha-envio', erro: ajustes.whatsappOperadorFalha }
        : { enviado: true };
    },
    getRawConfig: async () => (ajustes.config === undefined
      ? { enabled: true, ownerJid: '5564999990000@s.whatsapp.net', groupId: 'grupo@g.us' }
      : ajustes.config),
    enviarWhatsapp: async (householdId, config, destino, texto) => {
      whatsappsDaFamilia.push({ householdId, destino, texto });
      return ajustes.whatsappClienteFalha
        ? { enviado: false, erro: ajustes.whatsappClienteFalha }
        : { enviado: true };
    },
    buscarEmailDoDono: async () => (ajustes.emailDoDono === undefined ? 'dono@example.com' : ajustes.emailDoDono),
    registrarFalha: async (dados) => {
      if (ajustes.registrarQuebra) throw new Error('Firestore fora do ar');
      falhas.push(dados);
    },
    emailDaEquipe: EQUIPE,
    urlBase: 'https://revelacash.com.br',
  });
}

beforeEach(() => { servico = montar(); });

/**
 * Tudo que saiu, para varrer atrás de vazamento.
 *
 * `e.html` está aqui porque a primeira versão desta função esquecia dele: os
 * avisos ganharam corpo em HTML e a asserção de privacidade continuou olhando
 * só o texto. Um vazamento no HTML — o corpo que a pessoa realmente lê —
 * passaria com os 30 testes verdes.
 */
function tudoQueFoiEnviado() {
  return [
    ...enviados.flatMap((e) => [e.assunto, e.texto, e.html, e.para]),
    ...avisosAoOperador.map((a) => a.texto),
    ...whatsappsDaFamilia.map((w) => w.texto),
  ].filter(Boolean).join('\n');
}

describe('chamadoNovo — avisa a equipe', () => {
  it('manda e-mail para a caixa da equipe e WhatsApp para o operador', async () => {
    await servico.chamadoNovo({ numero: NUMERO, householdId: FAMILIA });

    expect(enviados).toHaveLength(1);
    expect(enviados[0].para).toBe(EQUIPE);
    expect(avisosAoOperador).toHaveLength(1);
  });

  it('o corpo leva o número e o link do painel', async () => {
    await servico.chamadoNovo({ numero: NUMERO, householdId: FAMILIA });

    expect(enviados[0].texto).toContain('#42');
    expect(enviados[0].texto).toContain('https://revelacash.com.br/plataforma');
  });

  it('não avisa o cliente — quem abriu já sabe que abriu', async () => {
    await servico.chamadoNovo({ numero: NUMERO, householdId: FAMILIA });

    expect(whatsappsDaFamilia).toHaveLength(0);
  });
});

describe('clienteRespondeu — avisa a equipe', () => {
  it('pelos dois canais', async () => {
    await servico.clienteRespondeu({ numero: NUMERO, householdId: FAMILIA });

    expect(enviados[0].para).toBe(EQUIPE);
    expect(avisosAoOperador).toHaveLength(1);
  });
});

describe('suporteRespondeu — avisa o dono da conta', () => {
  it('pelo WhatsApp da família e pelo e-mail do dono', async () => {
    await servico.suporteRespondeu({ numero: NUMERO, householdId: FAMILIA, ownerId: OWNER });

    expect(whatsappsDaFamilia).toHaveLength(1);
    expect(enviados[0].para).toBe('dono@example.com');
  });

  it('o link é o do chamado, não o do painel do operador', async () => {
    await servico.suporteRespondeu({ numero: NUMERO, householdId: FAMILIA, ownerId: OWNER });

    expect(whatsappsDaFamilia[0].texto).toContain('https://revelacash.com.br/suporte/42');
    expect(whatsappsDaFamilia[0].texto).not.toContain('/plataforma');
  });

  it('prefere o número do dono ao grupo da família', async () => {
    await servico.suporteRespondeu({ numero: NUMERO, householdId: FAMILIA, ownerId: OWNER });

    expect(whatsappsDaFamilia[0].destino).toBe('5564999990000@s.whatsapp.net');
  });

  it('cai para o grupo quando a família não tem número do dono', async () => {
    servico = montar({ config: { enabled: true, ownerJid: null, groupId: 'grupo@g.us' } });

    await servico.suporteRespondeu({ numero: NUMERO, householdId: FAMILIA, ownerId: OWNER });

    expect(whatsappsDaFamilia[0].destino).toBe('grupo@g.us');
  });

  it('dono sem e-mail no Auth não impede o WhatsApp', async () => {
    servico = montar({ emailDoDono: null });

    await servico.suporteRespondeu({ numero: NUMERO, householdId: FAMILIA, ownerId: OWNER });

    expect(enviados).toHaveLength(0);
    expect(whatsappsDaFamilia).toHaveLength(1);
  });

  it('família sem canal ativo não vira falha de entrega', async () => {
    // Ela simplesmente não usa WhatsApp. Registrar isso encheria a tela do
    // operador de ruído que ele não tem como resolver.
    servico = montar({ config: { enabled: false } });

    await servico.suporteRespondeu({ numero: NUMERO, householdId: FAMILIA, ownerId: OWNER });

    expect(falhas).toHaveLength(0);
    expect(enviados).toHaveLength(1);
  });
});

describe('chamadoEncaminhado', () => {
  it('vai para o e-mail REAL do operador quando existe', async () => {
    await servico.chamadoEncaminhado({
      numero: NUMERO, householdId: FAMILIA,
      para: { nome: 'Maria', email: 'maria@empresa.com' },
    });

    expect(enviados[0].para).toBe('maria@empresa.com');
    expect(enviados[0].texto).toContain('Maria');
  });

  it('cai na caixa da equipe quando o operador não tem e-mail real', async () => {
    // O login do operador é um e-mail interno (@operador.revelacash.internal)
    // que ninguém lê. Mandar para lá seria mandar para o vazio com cara de
    // entregue.
    await servico.chamadoEncaminhado({
      numero: NUMERO, householdId: FAMILIA, para: { nome: 'Maria', email: null },
    });

    expect(enviados[0].para).toBe(EQUIPE);
  });
});

describe('PRIVACIDADE — nenhum aviso carrega conteúdo', () => {
  const eventos = [
    ['chamadoNovo', (s) => s.chamadoNovo({
      numero: NUMERO, householdId: FAMILIA, assunto: ASSUNTO_DO_CLIENTE, texto: TEXTO_DO_CLIENTE,
    })],
    ['clienteRespondeu', (s) => s.clienteRespondeu({
      numero: NUMERO, householdId: FAMILIA, assunto: ASSUNTO_DO_CLIENTE, texto: TEXTO_DO_CLIENTE,
    })],
    ['suporteRespondeu', (s) => s.suporteRespondeu({
      numero: NUMERO, householdId: FAMILIA, ownerId: OWNER,
      assunto: ASSUNTO_DO_CLIENTE, texto: TEXTO_DO_CLIENTE,
    })],
    ['chamadoEncaminhado', (s) => s.chamadoEncaminhado({
      numero: NUMERO, householdId: FAMILIA, para: { nome: 'Maria' },
      assunto: ASSUNTO_DO_CLIENTE, texto: TEXTO_DO_CLIENTE,
    })],
  ];

  for (const [nome, disparar] of eventos) {
    it(`${nome} não vaza o texto da mensagem`, async () => {
      await disparar(servico);
      expect(tudoQueFoiEnviado()).not.toContain('5555 4444');
    });

    it(`${nome} não vaza nem o ASSUNTO escrito pelo cliente`, async () => {
      // O assunto é escrito pelo cliente e pode ser tão sensível quanto a
      // mensagem. Uma linha dessas na prévia de notificação do celular é
      // vazamento por conveniência.
      await disparar(servico);
      expect(tudoQueFoiEnviado()).not.toContain('desempregado');
    });

    it(`${nome} leva o número do chamado`, async () => {
      await disparar(servico);
      expect(tudoQueFoiEnviado()).toContain('#42');
    });

    it(`${nome} manda HTML e texto puro juntos`, async () => {
      await disparar(servico);

      // Só-HTML pontua pior no filtro de spam, e leitor de tela usa o texto.
      for (const e of enviados) {
        expect(e.html).toContain('<!doctype html>');
        expect(e.texto).toBeTruthy();
        expect(e.texto).not.toContain('<');
      }
    });
  }
});

describe('falha de entrega vira registro, nunca exceção', () => {
  it('e-mail que falha entra em notificacoesNaoEntregues', async () => {
    servico = montar({ emailFalha: '403 domain not verified' });

    await servico.chamadoNovo({ numero: NUMERO, householdId: FAMILIA });

    expect(falhas).toHaveLength(1);
    expect(falhas[0]).toMatchObject({
      tipo: TIPOS.CHAMADO_NOVO, canal: CANAIS.EMAIL,
      numero: NUMERO, householdId: FAMILIA, destinatario: EQUIPE,
    });
    expect(falhas[0].erro).toContain('403');
  });

  it('WhatsApp do operador que falha também entra', async () => {
    servico = montar({ whatsappOperadorFalha: 'instância desconectada' });

    await servico.clienteRespondeu({ numero: NUMERO, householdId: FAMILIA });

    expect(falhas.some((f) => f.canal === CANAIS.WHATSAPP)).toBe(true);
  });

  it('WhatsApp do cliente que falha registra o destino', async () => {
    servico = montar({ whatsappClienteFalha: 'número inválido' });

    await servico.suporteRespondeu({ numero: NUMERO, householdId: FAMILIA, ownerId: OWNER });

    const doWhats = falhas.find((f) => f.canal === CANAIS.WHATSAPP);
    expect(doWhats.destinatario).toBe('5564999990000@s.whatsapp.net');
  });

  it('um canal falhando não impede o outro', async () => {
    servico = montar({ emailFalha: 'caiu' });

    await servico.chamadoNovo({ numero: NUMERO, householdId: FAMILIA });

    expect(avisosAoOperador).toHaveLength(1);
  });

  it('nem o registro da falha falhando derruba o aviso', async () => {
    servico = montar({ emailFalha: 'caiu', registrarQuebra: true });

    await expect(servico.chamadoNovo({ numero: NUMERO, householdId: FAMILIA }))
      .resolves.toBeUndefined();
  });

  it('canal DESLIGADO não conta como falha de entrega', async () => {
    servico = criarNotificacaoChamadoService({
      emailService: { enviar: async () => ({ enviado: false, motivo: 'desligado' }) },
      avisarOperador: async () => ({ enviado: false, motivo: 'desligado' }),
      getRawConfig: async () => null,
      enviarWhatsapp: async () => ({ enviado: true }),
      buscarEmailDoDono: async () => null,
      registrarFalha: async (d) => falhas.push(d),
      emailDaEquipe: null,
      urlBase: 'https://revelacash.com.br',
    });

    await servico.chamadoNovo({ numero: NUMERO, householdId: FAMILIA });

    // Ambiente sem e-mail nem WhatsApp configurado é o de teste. Encher a tela
    // do operador de "não entregue" ali seria ruído puro.
    expect(falhas).toHaveLength(0);
  });
});
