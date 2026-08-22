/**
 * Backup do Firestore: fazer, listar, baixar e restaurar.
 *
 * Até 22/08/2026 o único backup do sistema era `npm run backup` rodado à mão
 * na máquina do Kirk — 13 famílias pagantes dependendo de alguém lembrar. Um
 * `apagar-agora` no lugar errado, um script com bug ou uma exclusão indevida
 * não teriam volta se o último dump fosse de semanas atrás.
 *
 * Isto NÃO substitui `tools/backup.js`: aquele gera um JSON legível, bom para
 * inspecionar e para restaurar documento a documento. Este é o export NATIVO
 * do Firestore (`exportDocuments`), que o próprio Firestore sabe reimportar
 * inteiro — é o que salva a operação num desastre de verdade.
 *
 * Por que o export nativo e não um dump em JSON pela function: o export roda
 * DENTRO da infraestrutura do Google, não passa pela memória da function, não
 * tem timeout de 9 minutos e não custa leitura de documento. A function só
 * dispara a operação e sai — quem faz o trabalho é o Firestore.
 *
 * DUAS GAVETAS (`diario/` e `mensal/`), e é isso que permite ter histórico
 * longo sem lixo: a regra de ciclo de vida do bucket apaga `diario/` em 30
 * dias e `mensal/` em 365. No dia 1 de cada mês o backup vai para `mensal/`,
 * nos outros dias para `diario/`. Com um prefixo só, ou se perde o histórico
 * antigo, ou se guardam 365 cópias diárias para consultar uma.
 */

const { v1 } = require('@google-cloud/firestore');
const crypto = require('crypto');

/** Coleções que NÃO entram no backup. Vazio = tudo. */
const COLECOES = [];

const GAVETAS = { DIARIO: 'diario', MENSAL: 'mensal' };

/** Teto do download em memória. Acima disso, só pelo `gcloud storage cp`. */
const MAXIMO_DOWNLOAD_BYTES = 150 * 1024 * 1024;

/** Marca que o Firestore só grava quando o export terminou por inteiro. */
const MARCA_DE_CONCLUSAO = '.overall_export_metadata';

function erro(mensagem, statusCode, codigo) {
  return Object.assign(new Error(mensagem), { statusCode, codigo });
}

function nomeDaPasta(agora) {
  // Ordenável por nome, sem os dois-pontos do ISO — que o GCS aceita, mas
  // atrapalham em qualquer ferramenta de linha de comando depois.
  return agora.toISOString().replace(/[:.]/g, '-');
}

/** Dia 1 vira backup mensal, guardado por um ano. */
function gavetaDe(agora) {
  return agora.getUTCDate() === 1 ? GAVETAS.MENSAL : GAVETAS.DIARIO;
}

/**
 * Compara segredos sem vazar informação pelo TEMPO da comparação.
 *
 * `a === b` sai no primeiro caractere diferente, e a diferença de
 * microssegundos entre "errou no 1º" e "errou no 10º" é medível — dá para
 * descobrir a senha caractere a caractere. Aqui as duas entradas viram hash de
 * tamanho fixo antes da comparação, então o tempo é constante.
 */
function segredoConfere(informado, esperado) {
  if (!esperado) return false;

  const a = crypto.createHash('sha256').update(String(informado || '')).digest();
  const b = crypto.createHash('sha256').update(String(esperado)).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * A pasta-raiz de um export, a partir do caminho de um arquivo dele.
 *
 * Contar segmentos NÃO funciona, e isso custou um bug: um export gravado na
 * raiz do bucket (`<carimbo>/all_namespaces/...`) e um gravado em gaveta
 * (`diario/<carimbo>/all_namespaces/...`) têm profundidades diferentes, e a
 * regra "os dois primeiros segmentos" partia o primeiro em DOIS backups na
 * tela — um com o metadado, outro com os dados.
 *
 * O que é estável é a ESTRUTURA que o Firestore escreve:
 *
 *   <raiz>/<nome>.overall_export_metadata
 *   <raiz>/all_namespaces/all_kinds/output-N
 *
 * Então a raiz é o que vem antes de `all_namespaces`, ou a pasta do arquivo de
 * metadados. Vale para os dois layouts sem saber qual é qual.
 */
function raizDoExport(caminho) {
  const marca = caminho.indexOf('/all_namespaces/');
  if (marca > 0) return caminho.slice(0, marca);

  const barra = caminho.lastIndexOf('/');
  return barra > 0 ? caminho.slice(0, barra) : caminho;
}

function criarServicoDeBackup({
  cliente, bucketDeArquivos, projectId, bucket, colecoes = COLECOES,
  senhaDeRestauracao = null, agora = () => new Date(),
}) {
  function exigirBucket() {
    if (!bucket) {
      throw erro(
        'BACKUP_BUCKET não configurado — backup automático desligado.',
        503, 'BUCKET_NAO_CONFIGURADO',
      );
    }
  }

  /**
   * Dispara um export e devolve o nome da operação.
   *
   * Não espera terminar: o export é assíncrono no Firestore e pode levar
   * minutos. Esperar aqui só queimaria tempo de function — a operação continua
   * de pé sozinha, e o resultado aparece na listagem quando concluir.
   */
  async function exportarAgora(quando = agora(), gaveta = null) {
    exigirBucket();

    const pasta = `${gaveta || gavetaDe(quando)}/${nomeDaPasta(quando)}`;
    const destino = `gs://${bucket}/${pasta}`;

    const [operacao] = await cliente.exportDocuments({
      name: cliente.databasePath(projectId, '(default)'),
      outputUriPrefix: destino,
      collectionIds: colecoes,
    });

    return {
      id: pasta,
      destino,
      operacao: operacao.name || null,
      iniciadoEm: quando.toISOString(),
    };
  }

  /**
   * Os backups existentes, do mais novo para o mais antigo.
   *
   * Agrupa os objetos do bucket por pasta. `completo` sai da presença do
   * `.overall_export_metadata`, que o Firestore só grava quando o export
   * terminou — sem esse campo, um export interrompido pareceria um backup
   * válido na tela, que é a pior mentira que este painel poderia contar.
   */
  async function listar() {
    exigirBucket();

    const [arquivos] = await bucketDeArquivos.getFiles();
    const porPasta = new Map();

    for (const arquivo of arquivos) {
      const id = raizDoExport(arquivo.name);
      if (!id) continue;

      const primeiraParte = id.split('/')[0];

      const atual = porPasta.get(id) || {
        id,
        gaveta: Object.values(GAVETAS).includes(primeiraParte) ? primeiraParte : 'avulso',
        arquivos: 0,
        bytes: 0,
        completo: false,
        criadoEm: null,
      };

      atual.arquivos += 1;
      atual.bytes += Number(arquivo.metadata?.size || 0);
      if (arquivo.name.endsWith(MARCA_DE_CONCLUSAO)) atual.completo = true;

      const quando = arquivo.metadata?.timeCreated;
      if (quando && (!atual.criadoEm || quando < atual.criadoEm)) atual.criadoEm = quando;

      porPasta.set(id, atual);
    }

    return [...porPasta.values()]
      .map((b) => ({ ...b, megabytes: Number((b.bytes / 1024 / 1024).toFixed(2)) }))
      .sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
  }

  /** Um backup pela id, ou 404. Usado antes de baixar e de restaurar. */
  async function buscar(id) {
    const encontrado = (await listar()).find((b) => b.id === id);
    if (!encontrado) throw erro('Backup não encontrado.', 404, 'BACKUP_NAO_ENCONTRADO');
    return encontrado;
  }

  /**
   * O backup inteiro num .zip, para guardar fora do Google.
   *
   * Redundância de verdade é ter cópia em outro lugar — um bucket, por mais
   * durável que seja, ainda é uma conta só. O teto de tamanho existe porque
   * isto passa pela MEMÓRIA da function: acima dele a resposta certa é o
   * `gcloud storage cp -r`, não derrubar a instância.
   */
  async function baixar(id) {
    const backup = await buscar(id);

    if (backup.bytes > MAXIMO_DOWNLOAD_BYTES) {
      const mb = Math.round(MAXIMO_DOWNLOAD_BYTES / 1024 / 1024);
      throw erro(
        `Este backup tem ${backup.megabytes} MB e o download pelo painel para em ${mb} MB. `
        + `Baixe com: gcloud storage cp -r gs://${bucket}/${id} .`,
        413, 'BACKUP_GRANDE_DEMAIS',
      );
    }

    const JSZip = require('jszip');
    const zip = new JSZip();

    const [arquivos] = await bucketDeArquivos.getFiles({ prefix: `${id}/` });
    for (const arquivo of arquivos) {
      const [conteudo] = await arquivo.download();
      // Sem o prefixo da pasta: quem descompacta encontra o export na raiz,
      // que é o formato que o `gcloud firestore import` espera.
      zip.file(arquivo.name.slice(id.length + 1), conteudo);
    }

    return {
      nome: `${id.replace(/\//g, '_')}.zip`,
      conteudo: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    };
  }

  /**
   * Restaura um backup POR CIMA do banco atual.
   *
   * A ação mais perigosa do sistema inteiro, e o desenho reflete isso:
   *
   *   1. Sem `BACKUP_RESTORE_SENHA` configurada, restauração é RECUSADA. Um
   *      botão de restaurar sem segunda senha seria pior que não ter botão.
   *   2. A senha é conferida em tempo constante (ver `segredoConfere`).
   *   3. Quem chama repete a id do backup — não existe restaurar por engano no
   *      item errado da lista.
   *   4. **Um backup de segurança do estado ATUAL é feito antes**, e a id dele
   *      volta na resposta. Sem isso, restaurar por engano seria irreversível.
   *
   * IMPORTANTE, e a tela precisa dizer: o import do Firestore é uma FUSÃO, não
   * uma substituição. Documento que existe no backup sobrescreve o atual;
   * documento criado DEPOIS do backup continua onde está. O banco não volta a
   * ser exatamente o que era — ele vira a soma dos dois.
   */
  async function restaurar(id, { senha, confirmacao }, quando = agora()) {
    exigirBucket();

    if (!senhaDeRestauracao) {
      throw erro(
        'Restauração desligada: o segredo BACKUP_RESTORE_SENHA não está configurado.',
        503, 'RESTAURACAO_DESLIGADA',
      );
    }
    if (!segredoConfere(senha, senhaDeRestauracao)) {
      throw erro('Senha de restauração incorreta.', 403, 'SENHA_INCORRETA');
    }
    if (confirmacao !== id) {
      throw erro(
        'A confirmação não bate com o backup escolhido. Nada foi restaurado.',
        409, 'CONFIRMACAO_NAO_CONFERE',
      );
    }

    const backup = await buscar(id);
    if (!backup.completo) {
      throw erro(
        'Este backup está incompleto (o export não terminou). Restaurar a partir dele '
        + 'deixaria o banco pela metade.',
        409, 'BACKUP_INCOMPLETO',
      );
    }

    // Rede de segurança: o estado de AGORA vira um backup antes de qualquer
    // sobrescrita. É o que transforma um erro de clique em algo reversível.
    const seguranca = await exportarAgora(quando, GAVETAS.MENSAL);

    const [operacao] = await cliente.importDocuments({
      name: cliente.databasePath(projectId, '(default)'),
      inputUriPrefix: `gs://${bucket}/${id}`,
      collectionIds: colecoes,
    });

    return {
      restaurado: id,
      operacao: operacao.name || null,
      backupDeSeguranca: seguranca.id,
      iniciadoEm: quando.toISOString(),
    };
  }

  /** A restauração está disponível? A tela usa para não oferecer o que falha. */
  function restauracaoConfigurada() {
    return !!senhaDeRestauracao;
  }

  /**
   * O backup de hoje presta? Corpo da conferência diária.
   *
   * Existe porque "a rotina rodou" e "existe backup bom" são afirmações
   * diferentes, e até 22/08/2026 o sistema só sabia responder a primeira. Um
   * export interrompido, um pedaço perdido pela regra de ciclo de vida ou uma
   * rotina que parou de disparar são todos silenciosos — descobre-se no dia em
   * que o backup é a última coisa que restou, que é o pior dia possível para
   * descobrir.
   *
   * Três perguntas, todas baratas:
   *
   *   1. o mais novo tem a marca de conclusão?
   *   2. todos os `output-N` que o próprio export declarou estão no bucket, e
   *      nenhum com zero byte?
   *   3. ele é de hoje?
   *
   * O que NÃO é feito aqui, de propósito: abrir os arquivos para procurar os
   * dados dentro. Isso significa baixar o backup inteiro todo dia, e o custo
   * cresce junto com a base — `tools/verificar-backup.js` faz essa parte sob
   * demanda, quando alguém quer a garantia mais forte.
   *
   * Lança quando algo está errado: quem chama é o `vigiar`, e é ele que
   * transforma a exceção em aviso na tela do operador.
   */
  async function verificarUltimoBackup(quando = agora()) {
    exigirBucket();

    const backups = await listar();
    if (!backups.length) throw erro('Nenhum backup no bucket.', 500, 'SEM_BACKUP');

    const maisNovo = backups[0];
    const problemas = [];

    if (!maisNovo.completo) {
      problemas.push('o export não terminou (sem .overall_export_metadata)');
    }

    const idadeEmHoras = (quando.getTime() - new Date(maisNovo.criadoEm).getTime()) / 3_600_000;
    if (idadeEmHoras > 26) {
      problemas.push(`o backup mais novo tem ${idadeEmHoras.toFixed(0)}h — a rotina parou de rodar`);
    }

    const [arquivos] = await bucketDeArquivos.getFiles({ prefix: `${maisNovo.id}/` });
    const porNome = new Map(arquivos.map((a) => [a.name, a]));

    const vazios = arquivos.filter((a) => Number(a.metadata?.size || 0) === 0);
    if (vazios.length) {
      problemas.push(`${vazios.length} arquivo(s) com zero byte`);
    }

    const caminhoDoMetadado = `${maisNovo.id}/all_namespaces/all_kinds/all_namespaces_all_kinds.export_metadata`;
    const metadado = porNome.get(caminhoDoMetadado);

    if (!metadado) {
      problemas.push('o export não tem o metadado que lista as peças');
    } else {
      const [conteudo] = await metadado.download();
      // Os nomes são strings literais dentro do protobuf: extrair por regex
      // evita carregar um descritor de proto para ler meia dúzia de nomes.
      const declaradas = [...new Set(conteudo.toString('latin1').match(/output-\d+/g) || [])];
      const faltando = declaradas.filter(
        (nome) => !porNome.has(`${maisNovo.id}/all_namespaces/all_kinds/${nome}`),
      );

      if (faltando.length) {
        problemas.push(`${faltando.length} de ${declaradas.length} peça(s) declarada(s) sumiram do bucket`);
      }
    }

    if (problemas.length) {
      throw erro(
        `Backup ${maisNovo.id} não está confiável: ${problemas.join('; ')}.`,
        500, 'BACKUP_NAO_CONFIAVEL',
      );
    }

    return {
      id: maisNovo.id,
      arquivos: maisNovo.arquivos,
      megabytes: maisNovo.megabytes,
      idadeEmHoras: Number(idadeEmHoras.toFixed(1)),
    };
  }

  return {
    exportarAgora, listar, buscar, baixar, restaurar, restauracaoConfigurada,
    verificarUltimoBackup,
  };
}

let _padrao = null;
function servico() {
  if (!_padrao) {
    const { admin, projectId, caminhoDaCredencial } = require('../config/firebaseAdmin');
    const nomeDoBucket = process.env.BACKUP_BUCKET;

    // Dentro de Cloud Functions o cliente acha a credencial sozinho (ADC). Num
    // script local isso não existe, então aponta-se para a MESMA chave que o
    // firebase-admin usou — sem isso o cliente procura credencial de ambiente e
    // falha com "Could not load the default credentials".
    _padrao = criarServicoDeBackup({
      cliente: new v1.FirestoreAdminClient(
        caminhoDaCredencial ? { keyFilename: caminhoDaCredencial } : {},
      ),
      bucketDeArquivos: nomeDoBucket ? admin.storage().bucket(nomeDoBucket) : null,
      projectId,
      bucket: nomeDoBucket,
      senhaDeRestauracao: process.env.BACKUP_RESTORE_SENHA || null,
    });
  }
  return _padrao;
}

module.exports = {
  criarServicoDeBackup,
  nomeDaPasta,
  raizDoExport,
  gavetaDe,
  segredoConfere,
  GAVETAS,
  MAXIMO_DOWNLOAD_BYTES,
  exportarAgora: (...a) => servico().exportarAgora(...a),
  listar: (...a) => servico().listar(...a),
  buscar: (...a) => servico().buscar(...a),
  baixar: (...a) => servico().baixar(...a),
  restaurar: (...a) => servico().restaurar(...a),
  verificarUltimoBackup: (...a) => servico().verificarUltimoBackup(...a),
  restauracaoConfigurada: (...a) => servico().restauracaoConfigurada(...a),
};
