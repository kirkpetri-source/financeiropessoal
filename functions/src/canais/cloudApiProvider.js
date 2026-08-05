/**
 * Canal WhatsApp Cloud API — Groups API oficial da Meta.
 *
 * Aberta a todas as contas com Official Business Account desde 16/06/2026.
 * Limites que importam: 8 participantes por grupo (cabe uma família) e 10.000
 * grupos por número — ou seja, um número atende 10 mil famílias.
 *
 * Economia: mensagem recebida não é cobrada, e resposta enviada dentro de 24h
 * da última mensagem do cliente entra como "service message", grátis e sem
 * teto. O ciclo lançar → confirmar custa R$ 0,00. Só há cobrança em mensagem
 * proativa fora da janela (template utility).
 *
 * ESTE PROVIDER AINDA NÃO ESTÁ ATIVO: depende da OBA sair (via Meta Verified).
 * O código está aqui para que a virada seja trocar um campo na configuração da
 * família, e não reescrever o processamento. As chamadas estão implementadas
 * conforme a documentação, mas ainda não foram exercitadas contra a API real —
 * tratar como não verificado até o primeiro teste de ponta a ponta.
 */

const VERSAO = 'v21.0';
const BASE = `https://graph.facebook.com/${VERSAO}`;

function exigirConfig(config) {
  if (!config?.cloudApiPhoneNumberId || !config?.cloudApiToken) {
    throw Object.assign(
      new Error('Configuração da Cloud API incompleta (phoneNumberId e token).'),
      { statusCode: 400 }
    );
  }
}

async function enviarTexto(config, destino, texto) {
  exigirConfig(config);

  const resposta = await fetch(`${BASE}/${config.cloudApiPhoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.cloudApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      // "group" é o que diferencia da mensagem individual; o destino é o
      // group_id devolvido pela Groups API na criação.
      recipient_type: 'group',
      to: destino,
      type: 'text',
      text: { body: texto },
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Cloud API ${resposta.status}: ${corpo.slice(0, 200)}`);
  }

  const dados = await resposta.json();
  return { messageId: dados?.messages?.[0]?.id || null, bruto: dados };
}

/**
 * Cria o grupo da família e devolve o link de convite.
 * É o que troca o onboarding manual ("adicione este número ao seu grupo") por
 * um clique: o sistema cria o grupo e manda o convite pronto.
 */
async function criarGrupo(config, nome) {
  exigirConfig(config);

  const resposta = await fetch(`${BASE}/${config.cloudApiPhoneNumberId}/groups`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.cloudApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', subject: nome }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Cloud API ${resposta.status}: ${corpo.slice(0, 200)}`);
  }

  const dados = await resposta.json();
  return { groupId: dados?.id || null, linkConvite: dados?.invite_link || null, bruto: dados };
}

/**
 * A Cloud API não expõe histórico: as mensagens chegam por webhook e ponto.
 * Por isso o polling não roda neste canal — e nem precisa, já que aqui não
 * existe o risco de instância caindo que motivou o polling na Evolution.
 */
async function buscarMensagens() {
  throw Object.assign(
    new Error('A Cloud API não permite buscar histórico; as mensagens chegam por webhook.'),
    { statusCode: 501 }
  );
}

async function obterIdentidadePropria(config) {
  return config?.cloudApiPhoneNumberId || null;
}

module.exports = {
  nome: 'cloud-api',
  suportaBusca: false,
  enviarTexto,
  criarGrupo,
  buscarMensagens,
  obterIdentidadePropria,
};
