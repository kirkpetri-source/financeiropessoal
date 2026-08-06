const { MAX_MEMBROS, nomeDaInstancia } = require('../config/evolutionServidor');

/**
 * Provisionamento do canal WhatsApp da família.
 *
 * O cliente que compra um controle financeiro não sabe — e não tem por que
 * saber — o que é instância, API key ou webhook. A tela dele tem três passos:
 *
 *   1. Ler um QR Code com o WhatsApp
 *   2. Tocar em "criar grupo da família"
 *   3. Mandar o link do grupo para quem vai participar
 *
 * Tudo que existe neste arquivo serve para sustentar esses três passos.
 *
 * Quem entra no grupo vira membro autorizado a lançar, identificado pelo
 * telefone. Não precisa de login: a Raquel manda "mercado 84,90" no grupo e o
 * gasto entra no nome dela. Login só é necessário para abrir o painel.
 */

const COLECAO = 'whatsappConfigs';

/**
 * Telefone no formato que o WhatsApp entende: só dígitos, com DDI.
 *
 * O cliente digita "(64) 99955-5364" ou "64999555364". Sem o 55 na frente o
 * WhatsApp não encontra o contato e o grupo nasce sem a pessoa — falha que
 * aparece só lá na frente, quando ninguém consegue lançar.
 */
function normalizarTelefone(entrada) {
  const digitos = String(entrada || '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  // 10 ou 11 dígitos = número brasileiro sem DDI (DDD + número).
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

function criarServicoDeInstancia({ db, admin, provider, householdService, webhookUrl }) {
  function ref(householdId) {
    return db.collection(COLECAO).doc(householdId);
  }

  function agora() {
    return admin.firestore.FieldValue.serverTimestamp();
  }

  async function docDaFamilia(householdId) {
    const doc = await ref(householdId).get();
    return doc.exists ? doc.data() : {};
  }

  /**
   * Passo 1 — cria a instância (se ainda não existe) e devolve o QR Code.
   *
   * Pode ser chamado quantas vezes for preciso: instância existente não é
   * recriada, e o QR expira em cerca de 40 segundos, então a tela vai pedir
   * de novo. Recriar a instância a cada pedido perderia a sessão de quem já
   * tinha lido.
   */
  async function conectar(householdId, config) {
    const instanceName = config.instanceName || nomeDaInstancia(householdId);

    const criacao = await provider.criarInstancia(config, { instanceName, webhookUrl });

    await ref(householdId).set({
      householdId,
      instanceName,
      // enabled só vira true quando a conexão de fato abrir — senão o polling
      // sairia batendo numa instância que ninguém leu o QR.
      provisionadaEm: agora(),
      updatedAt: agora(),
    }, { merge: true });

    const qr = await provider.obterQrCode({ ...config, instanceName }, instanceName);

    if (qr.conectada) {
      await marcarConectada(householdId);
      return { conectada: true, instanceName, jaExistia: criacao.jaExistia };
    }

    return {
      conectada: false,
      instanceName,
      qrcode: qr.qrcode,
      pairingCode: qr.pairingCode,
      jaExistia: criacao.jaExistia,
    };
  }

  async function marcarConectada(householdId) {
    await ref(householdId).set({
      enabled: true,
      conectadoEm: agora(),
      lastPollError: admin.firestore.FieldValue.delete(),
      updatedAt: agora(),
    }, { merge: true });
  }

  /** Estado completo, é o que a tela consulta em laço enquanto o QR está aberto. */
  async function status(householdId, config) {
    const doc = await docDaFamilia(householdId);

    if (!doc.instanceName) {
      return { etapa: 'sem_instancia', conectada: false, temGrupo: false };
    }

    const conexao = await provider.estadoDaConexao(config, doc.instanceName);

    if (conexao.conectada && !doc.enabled) await marcarConectada(householdId);

    return {
      etapa: !conexao.conectada ? 'aguardando_leitura'
        : !doc.groupId ? 'sem_grupo'
          : 'pronto',
      conectada: conexao.conectada,
      estado: conexao.estado,
      instanceName: doc.instanceName,
      temGrupo: !!doc.groupId,
      groupId: doc.groupId || null,
      linkConvite: doc.groupInviteUrl || null,
      maxMembros: MAX_MEMBROS,
    };
  }

  /**
   * Passo 2 — cria o grupo da família e guarda o link de convite.
   *
   * Só depois de conectado: criar grupo com a instância desconectada falha na
   * Evolution com erro obscuro, e o cliente ficaria olhando "erro interno".
   */
  async function criarGrupoDaFamilia(householdId, config, { nomeDaFamilia, telefones = [] }) {
    const doc = await docDaFamilia(householdId);

    if (!doc.instanceName) {
      throw Object.assign(new Error('Conecte o WhatsApp antes de criar o grupo.'), { statusCode: 409 });
    }

    if (doc.groupId) {
      const convite = await provider.linkDeConvite({ ...config, instanceName: doc.instanceName }, doc.groupId);
      return { groupId: doc.groupId, linkConvite: convite.linkConvite, jaExistia: true };
    }

    const conexao = await provider.estadoDaConexao(config, doc.instanceName);
    if (!conexao.conectada) {
      throw Object.assign(
        new Error('O WhatsApp ainda não está conectado. Leia o QR Code primeiro.'),
        { statusCode: 409, codigo: 'NAO_CONECTADO' },
      );
    }

    // O WhatsApp não cria grupo de uma pessoa só, e a Evolution devolve
    // "participants does not meet minimum length of 1". Em vez de repassar esse
    // erro, exigimos aqui o telefone de quem vai participar — que é o passo
    // natural: o produto existe para DUAS pessoas ou mais lançarem juntas.
    const participantes = telefones.map(normalizarTelefone).filter(Boolean);

    if (!participantes.length) {
      throw Object.assign(
        new Error('Informe o WhatsApp de pelo menos uma pessoa da família para criar o grupo.'),
        { statusCode: 400, codigo: 'SEM_PARTICIPANTE' },
      );
    }

    const configComInstancia = { ...config, instanceName: doc.instanceName };

    const { groupId } = await provider.criarGrupo(configComInstancia, {
      nome: `Financeiro — ${nomeDaFamilia || 'Nossa Família'}`,
      descricao: 'Mande seus gastos aqui. Ex.: "mercado 84,90 pix". Digite "ajuda" para ver os comandos.',
      participantes,
    });

    const convite = await provider.linkDeConvite(configComInstancia, groupId);

    await ref(householdId).set({
      groupId,
      groupInviteUrl: convite.linkConvite || null,
      enabled: true,
      grupoCriadoEm: agora(),
      updatedAt: agora(),
    }, { merge: true });

    return { groupId, linkConvite: convite.linkConvite, jaExistia: false };
  }

  /**
   * Passo 3 — quem está no grupo vira membro autorizado.
   *
   * Casamento por telefone. Quem já é membro só tem o nome atualizado; quem é
   * novo entra como `member`. Passando do teto, os excedentes são reportados e
   * NÃO viram membros — o limite é o que sustenta a cobrança por família.
   *
   * Ninguém é removido automaticamente: sair do grupo não apaga o histórico da
   * pessoa, e uma saída acidental não pode custar o cadastro dela.
   */
  async function sincronizarMembros(householdId, config) {
    const doc = await docDaFamilia(householdId);
    if (!doc.groupId) {
      throw Object.assign(new Error('A família ainda não tem grupo.'), { statusCode: 409 });
    }

    const participantes = await provider.participantesDoGrupo(
      { ...config, instanceName: doc.instanceName }, doc.groupId,
    );

    const membros = await householdService.listarMembros(householdId);
    const jaCadastrados = new Set(
      membros.map((m) => String(m.phone || '').replace(/\D/g, '')).filter(Boolean),
    );

    const novos = [];
    const excedentes = [];
    let total = membros.length;

    for (const p of participantes) {
      if (jaCadastrados.has(p.telefone)) continue;
      // Casa também quando um lado tem DDI e o outro não.
      if ([...jaCadastrados].some((c) => c.endsWith(p.telefone) || p.telefone.endsWith(c))) continue;

      if (total >= MAX_MEMBROS) {
        excedentes.push(p);
        continue;
      }

      await householdService.adicionarMembro(householdId, {
        // ID derivado do telefone: estável, e é a mesma chave usada para saber
        // quem lançou. Nome por si só duplicava membro a cada troca de apelido.
        userId: `wa-${p.telefone}`,
        nome: p.nome || `Membro ${p.telefone.slice(-4)}`,
        telefone: p.telefone,
        papel: 'member',
      });

      novos.push(p.telefone);
      total += 1;
    }

    await ref(householdId).set({
      membrosSincronizadosEm: agora(),
      updatedAt: agora(),
    }, { merge: true });

    return {
      participantes: participantes.length,
      novos: novos.length,
      excedentes: excedentes.length,
      limite: MAX_MEMBROS,
      totalDeMembros: total,
    };
  }

  /** Desliga o canal. Mantém o cadastro: reconectar não pode custar o histórico. */
  async function desconectar(householdId, config, { apagar = false } = {}) {
    const doc = await docDaFamilia(householdId);
    if (!doc.instanceName) return { desconectada: true };

    await provider.desconectarInstancia(config, doc.instanceName);
    if (apagar) await provider.apagarInstancia(config, doc.instanceName);

    await ref(householdId).set({
      enabled: false,
      desconectadoEm: agora(),
      ...(apagar ? { instanceName: null, groupId: null, groupInviteUrl: null } : {}),
      updatedAt: agora(),
    }, { merge: true });

    return { desconectada: true, apagada: apagar };
  }

  return {
    conectar,
    status,
    criarGrupoDaFamilia,
    sincronizarMembros,
    desconectar,
    marcarConectada,
  };
}

module.exports = { criarServicoDeInstancia, normalizarTelefone };
