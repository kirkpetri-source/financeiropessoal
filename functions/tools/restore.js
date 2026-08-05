#!/usr/bin/env node
/**
 * Restaura um backup gerado por tools/backup.js.
 *
 *   node tools/restore.js backups/2026-08-05T19-00-00.json --dry-run
 *   node tools/restore.js backups/2026-08-05T19-00-00.json --confirmar
 *
 * Escreve por merge (set com merge:true), preservando o ID de cada documento.
 * Não apaga nada que exista no banco e não esteja no backup — restaurar é
 * repor o que sumiu, não espelhar o arquivo.
 *
 * Sem --confirmar o script roda em modo simulação e não grava nada.
 */

const fs = require('fs');
const path = require('path');
const { admin, db } = require('../src/config/firebaseAdmin');

function desserializarValor(valor) {
  if (valor === null || valor === undefined) return null;

  if (Array.isArray(valor)) return valor.map(desserializarValor);

  if (typeof valor === 'object') {
    switch (valor.__tipo__) {
      case 'timestamp':
        return new admin.firestore.Timestamp(valor.segundos, valor.nanos);
      case 'geopoint':
        return new admin.firestore.GeoPoint(valor.lat, valor.lng);
      case 'ref':
        return db.doc(valor.caminho);
      case 'bytes':
        return Buffer.from(valor.base64, 'base64');
      default: {
        const saida = {};
        for (const [chave, v] of Object.entries(valor)) saida[chave] = desserializarValor(v);
        return saida;
      }
    }
  }
  return valor;
}

async function restaurarColecao(colecaoRef, documentos, simulacao, contador, caminhoLegivel) {
  // Lotes de 400 (o limite do Firestore é 500 operações por batch)
  const TAMANHO_LOTE = 400;

  for (let i = 0; i < documentos.length; i += TAMANHO_LOTE) {
    const fatia = documentos.slice(i, i + TAMANHO_LOTE);
    const lote = db.batch();

    for (const doc of fatia) {
      if (!simulacao) {
        lote.set(colecaoRef.doc(doc.id), desserializarValor(doc.dados), { merge: true });
      }
      contador.total++;
    }

    if (!simulacao) await lote.commit();
  }

  console.log(`  ${caminhoLegivel}: ${documentos.length} documento(s)`);

  // Subcoleções
  for (const doc of documentos) {
    if (!doc.subcolecoes) continue;
    for (const [nomeSub, docsSub] of Object.entries(doc.subcolecoes)) {
      await restaurarColecao(
        colecaoRef.doc(doc.id).collection(nomeSub),
        docsSub,
        simulacao,
        contador,
        `${caminhoLegivel}/${doc.id}/${nomeSub}`
      );
    }
  }
}

async function main() {
  const arquivo = process.argv[2];
  const simulacao = !process.argv.includes('--confirmar');

  if (!arquivo) {
    console.error('Uso: node tools/restore.js <arquivo.json> [--confirmar]');
    process.exit(1);
  }

  const caminho = path.resolve(arquivo);
  if (!fs.existsSync(caminho)) {
    console.error(`Arquivo não encontrado: ${caminho}`);
    process.exit(1);
  }

  const dump = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  if (!dump.colecoes) {
    console.error('Arquivo não parece um backup válido (falta a chave "colecoes").');
    process.exit(1);
  }

  console.log(`Backup de ${dump.geradoEm}`);
  console.log(simulacao
    ? 'MODO SIMULAÇÃO — nada será gravado. Use --confirmar para restaurar de verdade.\n'
    : 'RESTAURANDO PARA O FIRESTORE\n');

  const contador = { total: 0 };

  for (const [nome, documentos] of Object.entries(dump.colecoes)) {
    await restaurarColecao(db.collection(nome), documentos, simulacao, contador, nome);
  }

  console.log(`\n${simulacao ? 'Simulação concluída' : 'Restauração concluída'} — ${contador.total} documento(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFalha na restauração:', err);
  process.exit(1);
});
