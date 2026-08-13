/**
 * Central de comunicação do operador — templates de mensagem e envio em massa
 * pelo WhatsApp (avisos, novidades, dicas) para segmentos de famílias.
 *
 * Reaproveita o MESMO caminho de envio do bot (`respostaWhatsapp.responder`),
 * injetado como `enviarWhatsapp`: mesma assinatura invisível anti-loop, mesmo
 * registro em `whatsappLogs` (é o que faz a mensagem aparecer no histórico da
 * conversa da família, junto com tudo que o bot já manda). Nada de rota nova
 * pro provider — só reuso do que já existe e já é testado.
 *
 * `getRawConfig` é a config completa (com apiKey em texto puro) de
 * whatsappConfigService — família sem canal ativo simplesmente não recebe, e
 * o erro fica registrado no resultado em vez de derrubar o broadcast inteiro.
 */

const TIPOS_VALIDOS = new Set(['aviso', 'novidade', 'dica', 'atualizacao']);

function destinoDe(config) {
  return config?.modo === 'grupo' ? config.groupId : config?.ownerJid;
}

function criarServicoDeMensagens({ db, admin, getRawConfig, enviarWhatsapp }) {
  async function listarTemplates() {
    const snap = await db.collection('adminMessageTemplates').get();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0))
      .map((t) => ({
        ...t,
        createdAt: t.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: t.updatedAt?.toDate?.()?.toISOString() || null,
      }));
  }

  async function salvarTemplate({ id, titulo, tipo, texto, criadoPor }) {
    if (!TIPOS_VALIDOS.has(tipo)) {
      throw Object.assign(new Error(`Tipo "${tipo}" inválido.`), { statusCode: 400 });
    }
    const dados = { titulo: String(titulo).trim(), tipo, texto: String(texto).trim() };

    if (id) {
      const ref = db.collection('adminMessageTemplates').doc(id);
      const doc = await ref.get();
      if (!doc.exists) throw Object.assign(new Error('Template não encontrado.'), { statusCode: 404 });
      await ref.update({ ...dados, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { id, ...doc.data(), ...dados };
    }

    const ref = await db.collection('adminMessageTemplates').add({
      ...dados,
      criadoPor,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { id: ref.id, ...dados, criadoPor };
  }

  async function apagarTemplate(id) {
    await db.collection('adminMessageTemplates').doc(id).delete();
    return { apagado: true };
  }

  /**
   * `familias` já vem resolvida pela rota (lista de `{id, ...household}`),
   * pra este serviço não precisar saber nada de segmentação — só de enviar.
   */
  async function enviarBroadcast({ familias, texto, tipo, assunto, segmento, criadoPor }) {
    const limpo = String(texto || '').trim();
    if (!limpo) throw Object.assign(new Error('Mensagem vazia.'), { statusCode: 400 });
    if (!familias.length) throw Object.assign(new Error('Nenhuma família no público selecionado.'), { statusCode: 409 });

    const resultados = [];
    for (const familia of familias) {
      resultados.push(await enviarParaUma(familia.id, limpo));
      // Pausa curta entre envios: não é obrigatório pela Evolution, mas evita
      // rajada de N mensagens simultâneas na mesma instância quando o público
      // é grande.
      if (familias.length > 1) await new Promise((r) => setTimeout(r, 250));
    }

    const registro = {
      tipo: tipo || 'aviso',
      assunto: assunto || null,
      texto: limpo,
      segmento: segmento || null,
      criadoPor,
      totalDestinatarios: familias.length,
      totalOk: resultados.filter((r) => r.ok).length,
      totalErro: resultados.filter((r) => !r.ok).length,
      resultados,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('adminBroadcasts').add(registro);
    return { id: ref.id, ...registro, createdAt: new Date().toISOString() };
  }

  async function enviarParaUma(householdId, texto) {
    try {
      const config = await getRawConfig(householdId);
      if (!config || !config.enabled) {
        return { householdId, ok: false, erro: 'Canal do WhatsApp desativado ou não configurado.' };
      }
      const destino = destinoDe(config);
      if (!destino) {
        return { householdId, ok: false, erro: 'Sem grupo/número vinculado ainda (canal não pareado).' };
      }
      const envio = await enviarWhatsapp(householdId, config, destino, texto);
      return { householdId, ok: !!envio.enviado, erro: envio.enviado ? null : (envio.erro || 'Falha desconhecida.') };
    } catch (err) {
      return { householdId, ok: false, erro: err.message };
    }
  }

  /** Envio avulso a UMA família — mesma trilha do broadcast, registro com 1 destinatário. */
  async function enviarParaFamilia({ householdId, texto, criadoPor }) {
    const limpo = String(texto || '').trim();
    if (!limpo) throw Object.assign(new Error('Mensagem vazia.'), { statusCode: 400 });

    const resultado = await enviarParaUma(householdId, limpo);

    await db.collection('adminBroadcasts').add({
      tipo: 'individual',
      assunto: null,
      texto: limpo,
      segmento: null,
      criadoPor,
      totalDestinatarios: 1,
      totalOk: resultado.ok ? 1 : 0,
      totalErro: resultado.ok ? 0 : 1,
      resultados: [resultado],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (!resultado.ok) {
      throw Object.assign(new Error(resultado.erro || 'Falha ao enviar mensagem.'), { statusCode: 502 });
    }
    return resultado;
  }

  async function listarBroadcasts(limite = 30) {
    const snap = await db.collection('adminBroadcasts').get();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .slice(0, limite)
      .map((b) => ({ ...b, createdAt: b.createdAt?.toDate?.()?.toISOString() || null }));
  }

  return { listarTemplates, salvarTemplate, apagarTemplate, enviarBroadcast, enviarParaFamilia, listarBroadcasts };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { admin, db } = require('../config/firebaseAdmin');
    const whatsappConfigService = require('./whatsappConfigService');
    const respostaWhatsapp = require('./respostaWhatsapp');
    _padrao = criarServicoDeMensagens({
      db,
      admin,
      getRawConfig: whatsappConfigService.getRawConfig,
      enviarWhatsapp: respostaWhatsapp.responder,
    });
  }
  return _padrao;
}

module.exports = {
  criarServicoDeMensagens,
  TIPOS_VALIDOS,
  servico,
  listarTemplates: (...args) => servico().listarTemplates(...args),
  salvarTemplate: (...args) => servico().salvarTemplate(...args),
  apagarTemplate: (...args) => servico().apagarTemplate(...args),
  enviarBroadcast: (...args) => servico().enviarBroadcast(...args),
  enviarParaFamilia: (...args) => servico().enviarParaFamilia(...args),
  listarBroadcasts: (...args) => servico().listarBroadcasts(...args),
};
