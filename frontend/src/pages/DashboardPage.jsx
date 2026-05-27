import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, DollarSign, Tag, Plus, ArrowRight, FileBarChart } from 'lucide-react';
import MonthlyReport from '../components/reports/MonthlyReport';
import { useTransactions } from '../hooks/useTransactions';
import { useCategories } from '../hooks/useCategories';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { useWhatsappConfig } from '../hooks/useWhatsappConfig';
import ExpenseChart from '../components/charts/ExpenseChart';
import IncomeExpenseChart from '../components/charts/IncomeExpenseChart';
import Modal from '../components/ui/Modal';
import TransactionForm from '../components/forms/TransactionForm';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatCurrency, formatDate, currentMonth, monthsList, formatMonth, capitalizeFirst } from '../utils/formatters';
import toast from 'react-hot-toast';

function SummaryCard({ icon: Icon, label, value, colorClass, bgClass }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bgClass}`}>
        <Icon className={`w-5 h-5 ${colorClass}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 leading-tight">{label}</p>
        <p className={`text-base sm:text-lg font-bold leading-tight break-all ${colorClass}`}>{value}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [modalOpen, setModalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { summary, fetchSummary, createTransaction } = useTransactions();
  const { categories, fetchCategories } = useCategories();
  const { paymentMethods, fetchPaymentMethods } = usePaymentMethods();
  const { payers, fetchPayers } = useWhatsappConfig();

  const months = monthsList(12);

  useEffect(() => {
    fetchSummary(selectedMonth);
  }, [selectedMonth, fetchSummary]);

  useEffect(() => {
    fetchCategories();
    fetchPaymentMethods();
    fetchPayers();
  }, [fetchCategories, fetchPaymentMethods, fetchPayers]);

  async function handleCreateTransaction(data) {
    setSaving(true);
    try {
      await createTransaction(data);
      setModalOpen(false);
      fetchSummary(selectedMonth);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar lançamento.');
    } finally {
      setSaving(false);
    }
  }

  const [filterPayer, setFilterPayer] = useState('');
  const allPayers = summary?.byPayer?.filter(p => p.name !== 'Sem identificação') || [];

  // Filtra os dados do summary pelo pagador selecionado
  const filteredSummary = summary ? (() => {
    if (!filterPayer) return summary;
    const payer = summary.byPayer?.find(p => p.name === filterPayer);
    const income = payer?.income || 0;
    const expense = payer?.expense || 0;
    return { ...summary, totalIncome: income, totalExpense: expense, balance: income - expense };
  })() : null;

  const balance = filteredSummary ? filteredSummary.balance : 0;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Resumo financeiro de</p>
            <p className="text-base font-bold text-gray-900">{capitalizeFirst(formatMonth(selectedMonth))}</p>
          </div>
          <div className="flex items-center gap-2">
            {summary && (
              <button
                onClick={() => setReportOpen(true)}
                className="btn-secondary flex items-center gap-1.5"
                title="Gerar relatório mensal"
              >
                <FileBarChart className="w-4 h-4" />
                <span className="hidden sm:inline">Relatório</span>
              </button>
            )}
            <button
              onClick={() => setModalOpen(true)}
              className="btn-primary flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Novo</span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input w-auto text-sm"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>{capitalizeFirst(m.label)}</option>
            ))}
          </select>
          {/* Filtro por pagador */}
          {allPayers.length > 0 && (
            <select
              value={filterPayer}
              onChange={(e) => setFilterPayer(e.target.value)}
              className="input w-auto text-sm"
            >
              <option value="">👥 Todos</option>
              {allPayers.map(p => (
                <option key={p.name} value={p.name}>👤 {p.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Cards de resumo */}
      {!summary ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              icon={TrendingUp}
              label={filterPayer ? `Receitas (${filterPayer})` : 'Receitas'}
              value={formatCurrency(filteredSummary.totalIncome)}
              colorClass="text-green-600"
              bgClass="bg-green-50"
            />
            <SummaryCard
              icon={TrendingDown}
              label={filterPayer ? `Despesas (${filterPayer})` : 'Despesas'}
              value={formatCurrency(filteredSummary.totalExpense)}
              colorClass="text-red-500"
              bgClass="bg-red-50"
            />
            <SummaryCard
              icon={DollarSign}
              label={filterPayer ? `Saldo (${filterPayer})` : 'Saldo'}
              value={formatCurrency(balance)}
              colorClass={balance >= 0 ? 'text-primary-600' : 'text-red-600'}
              bgClass={balance >= 0 ? 'bg-primary-50' : 'bg-red-50'}
            />
            <SummaryCard
              icon={Tag}
              label="Maior Categoria"
              value={summary.topCategory?.name || '—'}
              colorClass="text-purple-600"
              bgClass="bg-purple-50"
            />
          </div>

          {/* Breakdown por pessoa — só aparece quando há mais de um pagador */}
          {!filterPayer && summary.byPayer && summary.byPayer.filter(p => p.name !== 'Sem identificação').length > 1 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">💰 Gastos por pessoa</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {summary.byPayer.filter(p => p.name !== 'Sem identificação').map((p) => (
                  <button
                    key={p.name}
                    onClick={() => setFilterPayer(p.name)}
                    className="text-left p-3 bg-gray-50 hover:bg-primary-50 rounded-xl transition-colors border border-transparent hover:border-primary-200"
                  >
                    <p className="text-xs text-gray-500 mb-1">{p.name}</p>
                    <p className="text-sm font-bold text-red-500">{formatCurrency(p.expense)}</p>
                    {p.income > 0 && <p className="text-xs text-green-600">+{formatCurrency(p.income)}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Despesas por Categoria</h2>
              <ExpenseChart data={summary.expenseByCategory} />
            </div>
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Receitas × Despesas</h2>
              <IncomeExpenseChart
                totalIncome={summary.totalIncome}
                totalExpense={summary.totalExpense}
              />
              {/* Top categorias de despesa */}
              {summary.expenseByCategory.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Top Categorias</p>
                  {summary.expenseByCategory.slice(0, 4).map((cat) => (
                    <div key={cat.name} className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color || '#94a3b8' }}
                      />
                      <span className="text-sm text-gray-700 flex-1 truncate">{cat.name}</span>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(cat.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Últimos lançamentos */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Últimos Lançamentos</h2>
              <button
                onClick={() => navigate('/transactions')}
                className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                Ver todos <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {summary.recentTransactions.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                Nenhum lançamento neste mês.
              </p>
            ) : (
              <div className="divide-y divide-gray-50">
                {summary.recentTransactions.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-3">
                    <div
                      className="w-2 h-8 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.category?.color || '#94a3b8' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{t.description}</p>
                      <p className="text-xs text-gray-400">
                        {t.category?.name} · {formatDate(t.date)}
                        {t.paidBy && <span className="ml-1 text-primary-500">· {t.paidBy}</span>}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-semibold flex-shrink-0 ${
                        t.type === 'INCOME' ? 'text-green-600' : 'text-red-500'
                      }`}
                    >
                      {t.type === 'INCOME' ? '+' : '-'}{formatCurrency(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Relatório mensal */}
      <MonthlyReport
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        summary={summary}
        month={selectedMonth}
      />

      {/* Modal novo lançamento */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Novo Lançamento">
        <TransactionForm
          categories={categories}
          paymentMethods={paymentMethods}
          payers={payers}
          onSubmit={handleCreateTransaction}
          isLoading={saving}
        />
      </Modal>
    </div>
  );
}
