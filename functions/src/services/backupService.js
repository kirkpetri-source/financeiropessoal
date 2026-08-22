/**
 * Backup automático do Firestore.
 *
 * Até 22/08/2026 o único backup do sistema era `npm run backup` rodado à mão
 * na máquina do Kirk — 13 famílias pagantes dependendo de alguém lembrar. Um
 * `apagar-agora` no lugar errado, um script com bug ou uma exclusão indevida
 * não teriam volta se o último dump fosse de semanas atrás.
 *
 * Isto NÃO substitui `tools/backup.js`: aquele gera um JSON legível, bom para
 * inspecionar e para restaurar documento a documento. Este é o export NATIVO
 * do Firestore (`exportDocuments`), que o próprio Firestore sabe reimportar
 * inteiro (`gcloud firestore import`) — é o que salva a operação num desastre
 * de verdade.
 *
 * Por que o export nativo e não um dump em JSON pela function: o export roda
 * DENTRO da infraestrutura do Google, não passa pela memória da function, não
 * tem timeout de 9 minutos e não custa leitura de documento. A function só
 * dispara a operação e sai — quem faz o trabalho é o Firestore.
 *
 * O destino é um bucket próprio (`BACKUP_BUCKET`), com regra de ciclo de vida
 * apagando o que passa de 30 dias. Sem isso o custo cresce para sempre, em
 * silêncio.
 */

const { v1 } = require('@google-cloud/firestore');

/** Coleções que NÃO entram no backup. Vazio = tudo. */
const COLECOES = [];

function nomeDaPasta(agora) {
  // Ordenável por nome, sem os dois-pontos do ISO — que o GCS aceita, mas
  // atrapalham em qualquer ferramenta de linha de comando depois.
  return agora.toISOString().replace(/[:.]/g, '-');
}

function criarServicoDeBackup({ cliente, projectId, bucket, colecoes = COLECOES }) {
  /**
   * Dispara um export e devolve o nome da operação.
   *
   * Não espera terminar: o export é assíncrono no Firestore e pode levar
   * minutos. Esperar aqui só queimaria tempo de function — a operação continua
   * de pé sozinha, e o resultado é conferível pelo nome devolvido.
   */
  async function exportarAgora(agora = new Date()) {
    if (!bucket) {
      throw Object.assign(
        new Error('BACKUP_BUCKET não configurado — backup automático desligado.'),
        { codigo: 'BUCKET_NAO_CONFIGURADO' },
      );
    }

    const destino = `gs://${bucket}/${nomeDaPasta(agora)}`;

    const [operacao] = await cliente.exportDocuments({
      name: cliente.databasePath(projectId, '(default)'),
      outputUriPrefix: destino,
      collectionIds: colecoes,
    });

    return {
      destino,
      operacao: operacao.name || null,
      iniciadoEm: agora.toISOString(),
    };
  }

  return { exportarAgora };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { projectId, caminhoDaCredencial } = require('../config/firebaseAdmin');

    // Dentro de Cloud Functions o cliente acha a credencial sozinho (ADC). Num
    // script local isso não existe, então aponta-se para a MESMA chave que o
    // firebase-admin usou — sem isso o cliente procura credencial de ambiente e
    // falha com "Could not load the default credentials".
    _padrao = criarServicoDeBackup({
      cliente: new v1.FirestoreAdminClient(
        caminhoDaCredencial ? { keyFilename: caminhoDaCredencial } : {},
      ),
      projectId,
      bucket: process.env.BACKUP_BUCKET,
    });
  }
  return _padrao;
}

module.exports = {
  criarServicoDeBackup,
  nomeDaPasta,
  exportarAgora: (...a) => servico().exportarAgora(...a),
};
