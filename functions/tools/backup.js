#!/usr/bin/env node
/**
 * Backup completo do Firestore para arquivo JSON local.
 *
 *   node tools/backup.js                  # salva em backups/AAAA-MM-DD_HH-mm-ss.json
 *   node tools/backup.js --out arquivo.json
 *
 * Preserva os tipos do Firestore (Timestamp, GeoPoint, DocumentReference) com
 * marcadores próprios, para que tools/restore.js consiga reconstruir tudo igual.
 *
 * O arquivo gerado contém dados financeiros reais — a pasta backups/ está no
 * .gitignore e não deve ser commitada nem enviada para nenhum lugar.
 */

const fs = require('fs');
const path = require('path');
const { admin, db } = require('../src/config/firebaseAdmin');

// Coleções conhecidas do sistema. listCollections() cobre o resto automaticamente,
// mas manter a lista explícita documenta o modelo de dados e serve de conferência.
const COLECOES_ESPERADAS = [
  'users',
  // households traz members/ e billingEvents/ em subcoleção; exportarColecao
  // desce sozinho, mas a família é a raiz do modelo e merece estar na lista.
  'households',
  'transactions',
  'categories',
  'paymentMethods',
  'whatsappConfigs',
  'whatsappLogs',
  'pollingLocks',
];

function serializarValor(valor) {
  if (valor === null || valor === undefined) return null;

  if (valor instanceof admin.firestore.Timestamp) {
    return { __tipo__: 'timestamp', segundos: valor.seconds, nanos: valor.nanoseconds };
  }
  if (valor instanceof admin.firestore.GeoPoint) {
    return { __tipo__: 'geopoint', lat: valor.latitude, lng: valor.longitude };
  }
  if (valor instanceof admin.firestore.DocumentReference) {
    return { __tipo__: 'ref', caminho: valor.path };
  }
  if (Buffer.isBuffer(valor)) {
    return { __tipo__: 'bytes', base64: valor.toString('base64') };
  }
  if (Array.isArray(valor)) {
    return valor.map(serializarValor);
  }
  if (typeof valor === 'object') {
    const saida = {};
    for (const [chave, v] of Object.entries(valor)) saida[chave] = serializarValor(v);
    return saida;
  }
  return valor;
}

async function exportarColecao(ref, caminhoLegivel) {
  const snap = await ref.get();
  const documentos = [];

  for (const doc of snap.docs) {
    const registro = { id: doc.id, dados: serializarValor(doc.data()) };

    // Subcoleções (o sistema não usa hoje, mas o backup não pode assumir isso)
    const subs = await doc.ref.listCollections();
    if (subs.length) {
      registro.subcolecoes = {};
      for (const sub of subs) {
        registro.subcolecoes[sub.id] = await exportarColecao(sub, `${caminhoLegivel}/${doc.id}/${sub.id}`);
      }
    }

    documentos.push(registro);
  }

  console.log(`  ${caminhoLegivel}: ${documentos.length} documento(s)`);
  return documentos;
}

async function main() {
  const argOut = process.argv.indexOf('--out');
  const pastaBackups = path.join(__dirname, '..', '..', 'backups');

  const carimbo = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const destino = argOut !== -1 && process.argv[argOut + 1]
    ? path.resolve(process.argv[argOut + 1])
    : path.join(pastaBackups, `${carimbo}.json`);

  fs.mkdirSync(path.dirname(destino), { recursive: true });

  console.log('Backup do Firestore\n');

  const colecoes = await db.listCollections();
  if (!colecoes.length) {
    console.error('Nenhuma coleção encontrada. Abortando sem gravar arquivo.');
    process.exit(1);
  }

  const dump = { geradoEm: new Date().toISOString(), colecoes: {} };

  for (const colecao of colecoes) {
    dump.colecoes[colecao.id] = await exportarColecao(colecao, colecao.id);
  }

  const faltando = COLECOES_ESPERADAS.filter((c) => !(c in dump.colecoes));
  if (faltando.length) {
    console.log(`\nAviso: coleções esperadas ausentes (podem estar vazias): ${faltando.join(', ')}`);
  }

  fs.writeFileSync(destino, JSON.stringify(dump, null, 2), 'utf8');

  const total = Object.values(dump.colecoes).reduce((s, docs) => s + docs.length, 0);
  const tamanhoMb = (fs.statSync(destino).size / 1024 / 1024).toFixed(2);

  console.log(`\nOK — ${total} documento(s) em ${Object.keys(dump.colecoes).length} coleção(ões)`);
  console.log(`Arquivo: ${destino} (${tamanhoMb} MB)`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFalha no backup:', err);
  process.exit(1);
});
