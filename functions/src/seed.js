/**
 * Popula os dados de referência do sistema: categorias e formas de pagamento padrão.
 *
 *   npm run seed
 *
 * É idempotente — rodar de novo não duplica nem sobrescreve nada.
 *
 * NÃO cria usuário nem lançamento de exemplo. A versão anterior criava um
 * admin@financeiro.local com senha 'admin123' (documentada no README) e oito
 * lançamentos fictícios direto no banco de produção. Num sistema com dados
 * financeiros reais, e mais ainda num SaaS pago, isso é porta aberta e sujeira.
 * Conta de verdade se cria pelo cadastro do aplicativo.
 */

require('./config/firebaseAdmin');
const { admin, db } = require('./config/firebaseAdmin');

const CATEGORIAS_DESPESA = [
  { name: 'Alimentação', color: '#f97316' },
  { name: 'Mercado', color: '#84cc16' },
  { name: 'Transporte', color: '#06b6d4' },
  { name: 'Combustível', color: '#f59e0b' },
  { name: 'Moradia', color: '#8b5cf6' },
  { name: 'Energia', color: '#eab308' },
  { name: 'Água', color: '#3b82f6' },
  { name: 'Internet', color: '#6366f1' },
  { name: 'Saúde', color: '#ef4444' },
  { name: 'Farmácia', color: '#ec4899' },
  { name: 'Educação', color: '#14b8a6' },
  { name: 'Igreja/Doações', color: '#a855f7' },
  { name: 'Lazer', color: '#f43f5e' },
  { name: 'Assinaturas', color: '#0ea5e9' },
  { name: 'Cartão de Crédito', color: '#64748b' },
  { name: 'Empréstimos', color: '#dc2626' },
  { name: 'Outros', color: '#94a3b8' },
];

const CATEGORIAS_RECEITA = [
  { name: 'Salário', color: '#22c55e' },
  { name: 'Serviços', color: '#10b981' },
  { name: 'Vendas', color: '#34d399' },
  { name: 'Reembolso', color: '#6ee7b7' },
  { name: 'Renda Extra', color: '#059669' },
  { name: 'Outros', color: '#94a3b8' },
];

const FORMAS_PAGAMENTO = ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Boleto', 'Transferência', 'Outro'];

async function criarSeNaoExistir(colecao, id, dados) {
  const ref = db.collection(colecao).doc(id);
  const doc = await ref.get();
  if (doc.exists) return false;
  await ref.set({ ...dados, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  return true;
}

function idPadrao(prefixo, nome) {
  return `${prefixo}-${nome.toLowerCase().replace(/[^a-z]/g, '-')}`;
}

async function main() {
  console.log('Seed de dados de referência\n');

  const totalCategorias = CATEGORIAS_DESPESA.length + CATEGORIAS_RECEITA.length;
  let criadas = 0;

  for (const cat of CATEGORIAS_DESPESA) {
    const novo = await criarSeNaoExistir('categories', idPadrao('default-expense', cat.name), {
      name: cat.name, type: 'EXPENSE', color: cat.color, isDefault: true, userId: null,
    });
    if (novo) criadas++;
  }
  for (const cat of CATEGORIAS_RECEITA) {
    const novo = await criarSeNaoExistir('categories', idPadrao('default-income', cat.name), {
      name: cat.name, type: 'INCOME', color: cat.color, isDefault: true, userId: null,
    });
    if (novo) criadas++;
  }
  console.log(`Categorias: ${criadas} criada(s), ${totalCategorias - criadas} já existia(m).`);

  let formasCriadas = 0;
  for (const forma of FORMAS_PAGAMENTO) {
    const novo = await criarSeNaoExistir('paymentMethods', idPadrao('default-pm', forma), {
      name: forma, isDefault: true, userId: null,
    });
    if (novo) formasCriadas++;
  }
  console.log(`Formas de pagamento: ${formasCriadas} criada(s), ${FORMAS_PAGAMENTO.length - formasCriadas} já existia(m).`);

  console.log('\nSeed concluído.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Falha no seed:', err);
  process.exit(1);
});
