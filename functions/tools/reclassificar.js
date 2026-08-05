#!/usr/bin/env node
/**
 * Corrige lançamentos que caíram na categoria errada por causa do bug de
 * casamento por substring (ex.: "netflix" virava Internet, porque a keyword
 * "net" casava dentro da palavra).
 *
 *   node tools/reclassificar.js              # simulação, não grava nada
 *   node tools/reclassificar.js --confirmar  # aplica as correções
 *
 * Critério deliberadamente estreito, para não desfazer escolha do usuário:
 *
 *  1. Só lançamentos com origin 'WHATSAPP' — foram categorizados pela regra.
 *     Lançamento manual reflete decisão de quem cadastrou e não se toca.
 *  2. Só quando a regra ANTIGA (includes) e a NOVA (palavra inteira) discordam.
 *     Se as duas concordam, o bug não afetou aquele lançamento.
 *  3. Só quando a categoria atual é exatamente a que a regra antiga sugeria.
 *     Se estiver em outra coisa, alguém editou depois — respeita a edição.
 */

const { db } = require('../src/config/firebaseAdmin');
const { suggestCategory } = require('../src/utils/financialParser');

// Réplica do comportamento antigo (substring), só para identificar o estrago.
// Mantida aqui e não no parser de propósito: é código de diagnóstico, descartável.
const CATEGORY_MAP_ANTIGO = {
  EXPENSE: [
    { keywords: ['mercado', 'supermercado', 'compra', 'feira'], category: 'Mercado' },
    { keywords: ['gasolina', 'combustível', 'combustivel', 'posto', 'diesel', 'álcool', 'alcool'], category: 'Combustível' },
    { keywords: ['almoço', 'almoco', 'lanche', 'jantar', 'comida', 'restaurante', 'pizza', 'hamburguer', 'café', 'cafe', 'ifood', 'delivery'], category: 'Alimentação' },
    { keywords: ['energia', 'luz', 'enel', 'celpe', 'copel'], category: 'Energia' },
    { keywords: ['água', 'agua', 'saneamento', 'compesa', 'sabesp'], category: 'Água' },
    { keywords: ['internet', 'wifi', 'net', 'vivo', 'claro', 'oi', 'tim'], category: 'Internet' },
    { keywords: ['remédio', 'remedio', 'farmácia', 'farmacia', 'droga', 'drogasil', 'ultrafarma'], category: 'Farmácia' },
    { keywords: ['uber', 'transporte', 'ônibus', 'onibus', 'metro', 'metrô', '99', 'taxi', 'táxi', 'passagem'], category: 'Transporte' },
    { keywords: ['igreja', 'oferta', 'dízimo', 'dizimo', 'doação', 'doacao'], category: 'Igreja/Doações' },
    { keywords: ['netflix', 'spotify', 'assinatura', 'prime', 'disney', 'youtube', 'globoplay'], category: 'Assinaturas' },
    { keywords: ['manutenção', 'manutencao', 'conserto', 'reparo', 'reforma'], category: 'Moradia' },
    { keywords: ['aluguel', 'condomínio', 'condominio', 'iptu', 'moradia'], category: 'Moradia' },
    { keywords: ['saúde', 'saude', 'médico', 'medico', 'consulta', 'exame', 'hospital', 'plano'], category: 'Saúde' },
    { keywords: ['escola', 'faculdade', 'curso', 'livro', 'educação', 'educacao', 'mensalidade'], category: 'Educação' },
    { keywords: ['cartão', 'cartao', 'fatura'], category: 'Cartão de Crédito' },
    { keywords: ['empréstimo', 'emprestimo', 'parcela', 'financiamento'], category: 'Empréstimos' },
  ],
  INCOME: [
    { keywords: ['salário', 'salario', 'pagamento', 'holerite'], category: 'Salário' },
    { keywords: ['serviço', 'servico', 'manutenção', 'manutencao', 'conserto', 'freela', 'freelance'], category: 'Serviços' },
    { keywords: ['venda', 'vendido', 'vendeu', 'vendi'], category: 'Vendas' },
    { keywords: ['reembolso', 'devolução', 'devolucao', 'estorno'], category: 'Reembolso' },
    { keywords: ['renda', 'extra', 'bico', 'aluguel recebido'], category: 'Renda Extra' },
  ],
};

function categoriaPelaRegraAntiga(descricao, tipo) {
  const lower = String(descricao).toLowerCase();
  for (const { keywords, category } of CATEGORY_MAP_ANTIGO[tipo] || []) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return 'Outros';
}

async function mapaCategorias() {
  const snap = await db.collection('categories').get();
  const porId = {};
  const porNomeTipo = {};
  snap.docs.forEach((d) => {
    const dados = d.data();
    porId[d.id] = dados;
    // Prioriza a categoria padrão quando há nome repetido
    const chave = `${dados.name}|${dados.type}`;
    if (!porNomeTipo[chave] || dados.isDefault) porNomeTipo[chave] = d.id;
  });
  return { porId, porNomeTipo };
}

async function main() {
  const simulacao = !process.argv.includes('--confirmar');

  console.log(simulacao
    ? 'MODO SIMULAÇÃO — nada será gravado.\n'
    : 'APLICANDO CORREÇÕES\n');

  const { porId, porNomeTipo } = await mapaCategorias();

  const snap = await db.collection('transactions').where('origin', '==', 'WHATSAPP').get();
  console.log(`Lançamentos via WhatsApp analisados: ${snap.size}\n`);

  const correcoes = [];

  for (const doc of snap.docs) {
    const t = doc.data();
    if (!t.description || !t.type) continue;

    const antiga = categoriaPelaRegraAntiga(t.description, t.type);
    const nova = suggestCategory(t.description, t.type);

    if (antiga === nova) continue;

    const categoriaAtual = porId[t.categoryId];
    if (!categoriaAtual || categoriaAtual.name !== antiga) continue;

    const novoId = porNomeTipo[`${nova}|${t.type}`];
    if (!novoId) {
      console.log(`  ignorado (categoria "${nova}" não existe): ${t.description}`);
      continue;
    }

    correcoes.push({ id: doc.id, descricao: t.description, valor: t.amount, de: antiga, para: nova, novoId });
  }

  if (!correcoes.length) {
    console.log('Nenhum lançamento afetado pelo bug. Nada a corrigir.');
    process.exit(0);
  }

  console.log(`Lançamentos a corrigir: ${correcoes.length}\n`);
  for (const c of correcoes) {
    const valor = Number(c.valor).toFixed(2).replace('.', ',');
    console.log(`  "${c.descricao}" (R$ ${valor})`);
    console.log(`      ${c.de}  ->  ${c.para}`);
  }

  if (simulacao) {
    console.log('\nSimulação. Rode com --confirmar para aplicar.');
    process.exit(0);
  }

  const lote = db.batch();
  for (const c of correcoes) {
    lote.update(db.collection('transactions').doc(c.id), { categoryId: c.novoId });
  }
  await lote.commit();

  console.log(`\n${correcoes.length} lançamento(s) corrigido(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Falha:', err);
  process.exit(1);
});
