import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Filter, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { useTransactions } from '../hooks/useTransactions';
import { useCategories } from '../hooks/useCategories';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { useWhatsappConfig } from '../hooks/useWhatsappConfig';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TransactionForm from '../components/forms/TransactionForm';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatCurrency, formatDate, currentMonth, monthsList, capitalizeFirst } from '../utils/formatters';
import toast from 'react-hot-toast';

const TYPE_LABELS = { INCOME: 'Receita', EXPENSE: 'Despesa' };
const ORIGIN_LABELS = { MANUAL: 'Manual', WHATSAPP: 'WhatsApp', AI: 'IA', AUDIO: 'Áudio', IMAGE: 'Imagem' };
const STATUS_LABELS = { CONFIRMED: 'Confirmado', PENDING: 'Pendente', ERROR: 'Erro' };
const STATUS_COLORS = {
  CONFIRMED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  ERROR: 'bg-red-100 text-red-700',
};

export default function TransactionsPage() {
  const [filters, setFilters] = useState({ month: currentMonth(), type: '', categoryId: '', paymentMethodId: '', origin: '', paidBy: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const { transactions, loading, fetchTransactions, createTransaction, updateTransaction, deleteTransaction } = useTransactions();
  const { categories, fetchCategories } = useCategories();
  const { paymentMethods, fetchPaymentMethods } = usePaymentMethods();
  const { payers, fetchPayers } = useWhatsappConfig();

  const months = monthsList(12);

  useEffect(() => { fetchTransactions(filters); }, [filters]);
  useEffect(() => { fetchCategories(); fetchPaymentMethods(); fetchPayers(); }, []);

  function openCreate() { setEditingTransaction(null); setModalOpen(true); }
  function openEdit(t) { setEditingTransaction(t); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditingTransaction(null); }

  async function handleSubmit(data) {
    setSaving(true);
    try {
      if (editingTransaction) {
        await updateTransaction(editingTransaction.id, data);
      } else {
        await createTransaction(data);
      }
      closeModal();
      fetchTransactions(filters);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteTransaction(deletingId);
      setDeletingId(null);
      fetchTransactions(filters);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir.');
    } finally {
      setDeleting(false);
    }
  }

  const totalIncome = transactions.filter(t => t.type === 'INCOME').reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = transactions.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Barra de ações */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={filters.month}
          onChange={(e) => setFilters(f => ({ ...f, month: e.target.value }))}
          className="input w-auto text-sm"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>{capitalizeFirst(m.label)}</option>
          ))}
        </select>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`btn-secondary flex items-center gap-2 text-sm ${showFilters ? 'bg-primary-50 border-primary-300 text-primary-700' : ''}`}
        >
          <Filter className="w-4 h-4" /> Filtros
        </button>

        <div className="sm:ml-auto">
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo Lançamento
          </button>
        </div>
      </div>

      {/* Filtros expandidos */}
      {showFilters && (
        <div className="card grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <label className="label text-xs">Tipo</label>
            <select className="input text-sm" value={filters.type} onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}>
              <option value="">Todos</option>
              <option value="INCOME">Receita</option>
              <option value="EXPENSE">Despesa</option>
            </select>
          </div>
          <div>
            <label className="label text-xs">Categoria</label>
            <select className="input text-sm" value={filters.categoryId} onChange={(e) => setFilters(f => ({ ...f, categoryId: e.target.value }))}>
              <option value="">Todas</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Pagamento</label>
            <select className="input text-sm" value={filters.paymentMethodId} onChange={(e) => setFilters(f => ({ ...f, paymentMethodId: e.target.value }))}>
              <option value="">Todos</option>
              {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Origem</label>
            <select className="input text-sm" value={filters.origin} onChange={(e) => setFilters(f => ({ ...f, origin: e.target.value }))}>
              <option value="">Todas</option>
              {Object.entries(ORIGIN_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {payers.length > 0 && (
            <div>
              <label className="label text-xs">Pago por</label>
              <select className="input text-sm" value={filters.paidBy} onChange={(e) => setFilters(f => ({ ...f, paidBy: e.target.value }))}>
                <option value="">Todos</option>
                {payers.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Totalizadores */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card py-3 flex items-center gap-2">
          <ArrowUpCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Receitas</p>
            <p className="text-sm font-bold text-green-600">{formatCurrency(totalIncome)}</p>
          </div>
        </div>
        <div className="card py-3 flex items-center gap-2">
          <ArrowDownCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Despesas</p>
            <p className="text-sm font-bold text-red-500">{formatCurrency(totalExpense)}</p>
          </div>
        </div>
        <div className="card py-3">
          <p className="text-xs text-gray-500">Saldo</p>
          <p className={`text-sm font-bold ${totalIncome - totalExpense >= 0 ? 'text-primary-600' : 'text-red-600'}`}>
            {formatCurrency(totalIncome - totalExpense)}
          </p>
        </div>
      </div>

      {/* Tabela/lista */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={Filter}
            title="Nenhum lançamento encontrado"
            description="Adicione um lançamento ou ajuste os filtros."
            action={<button onClick={openCreate} className="btn-primary">Novo Lançamento</button>}
          />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Data', 'Descrição', 'Categoria', 'Pagamento', ...(payers.length > 0 ? ['Pago por'] : []), 'Status', 'Valor', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: t.category?.color || '#94a3b8' }} />
                          <span className="text-sm font-medium text-gray-900 max-w-xs truncate">{t.description}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.category?.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.paymentMethod?.name}</td>
                      {payers.length > 0 && (
                        <td className="px-4 py-3">
                          {t.paidBy ? (
                            <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-medium">{t.paidBy}</span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status]}`}>
                          {STATUS_LABELS[t.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold whitespace-nowrap">
                        <span className={t.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}>
                          {t.type === 'INCOME' ? '+' : '-'}{formatCurrency(t.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(t)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeletingId(t.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {transactions.map((t) => (
                <div key={t.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: t.category?.color || '#94a3b8' }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.description}</p>
                        <p className="text-xs text-gray-400">
                          {t.category?.name} · {formatDate(t.date)} · {t.paymentMethod?.name}
                          {t.paidBy && <span className="ml-1 text-primary-500 font-medium">· {t.paidBy}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-sm font-bold ${t.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}>
                        {t.type === 'INCOME' ? '+' : '-'}{formatCurrency(t.amount)}
                      </span>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(t)} className="p-1 text-gray-400 hover:text-primary-600"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDeletingId(t.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingTransaction ? 'Editar Lançamento' : 'Novo Lançamento'}
      >
        <TransactionForm
          categories={categories}
          paymentMethods={paymentMethods}
          payers={payers}
          onSubmit={handleSubmit}
          initialData={editingTransaction}
          isLoading={saving}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Excluir lançamento?"
        message="Esta ação não pode ser desfeita."
        loading={deleting}
      />
    </div>
  );
}
