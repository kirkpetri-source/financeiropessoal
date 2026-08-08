import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, PiggyBank, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useBudgets } from '../hooks/useBudgets';
import { useCategories } from '../hooks/useCategories';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatCurrency, currentMonth } from '../utils/formatters';

function BudgetForm({ onSubmit, categorias, initialData, isLoading }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { categoryId: '', monthlyLimit: '' },
  });

  useEffect(() => {
    if (initialData) {
      reset({ categoryId: initialData.categoryId, monthlyLimit: (initialData.limitCents / 100).toFixed(2) });
    } else {
      reset({ categoryId: '', monthlyLimit: '' });
    }
  }, [initialData, reset]);

  function aoEnviar(data) {
    onSubmit({
      categoryId: data.categoryId,
      monthlyLimitCents: Math.round(Number(String(data.monthlyLimit).replace(',', '.')) * 100),
    });
  }

  return (
    <form onSubmit={handleSubmit(aoEnviar)} className="space-y-4">
      <div>
        <label className="label">Categoria *</label>
        <select className="input" disabled={!!initialData} {...register('categoryId', { required: true })}>
          <option value="">Selecione</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Limite mensal (R$) *</label>
        <input
          className={`input ${errors.monthlyLimit ? 'border-red-400' : ''}`}
          placeholder="Ex: 500,00"
          {...register('monthlyLimit', { required: 'Informe o limite mensal.' })}
        />
        {errors.monthlyLimit && <p className="text-xs text-red-500 mt-1">{errors.monthlyLimit.message}</p>}
        <p className="text-xs text-faint mt-1">Vale todo mês, até você mudar.</p>
      </div>
      <button type="submit" disabled={isLoading} className="btn-primary w-full">
        {isLoading ? 'Salvando...' : initialData ? 'Salvar Alterações' : 'Criar Orçamento'}
      </button>
    </form>
  );
}

export default function BudgetsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { budgets, resumo, loading, fetchBudgets, fetchResumo, createBudget, updateBudget, deleteBudget } = useBudgets();
  const { categories, fetchCategories } = useCategories();

  async function carregarTudo() {
    await fetchBudgets();
    await fetchResumo(currentMonth());
  }

  useEffect(() => { carregarTudo(); fetchCategories(); }, []);

  const categoriasDeDespesa = categories.filter((c) => c.type === 'EXPENSE' || c.type === 'BOTH');
  const categoriasSemOrcamento = categoriasDeDespesa.filter((c) => !budgets.some((b) => b.categoryId === c.id));

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(budget) { setEditing(budget); setModalOpen(true); }

  async function handleSubmit(data) {
    setSaving(true);
    try {
      if (editing) await updateBudget(editing.id, { monthlyLimitCents: data.monthlyLimitCents });
      else await createBudget(data);
      setModalOpen(false);
      setEditing(null);
      carregarTudo();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar orçamento.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteBudget(deletingId);
      setDeletingId(null);
      carregarTudo();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir orçamento.');
    } finally {
      setDeleting(false);
    }
  }

  const editingResumo = editing ? { ...editing, limitCents: budgets.find((b) => b.id === editing.id)?.monthlyLimitCents } : null;
  const estourados = resumo.filter((r) => r.estourado).length;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-ink">Orçamento por categoria</h1>
          <p className="text-sm text-muted">
            {estourados > 0
              ? `${estourados} categoria${estourados > 1 ? 's' : ''} ${estourados > 1 ? 'passaram' : 'passou'} do limite este mês.`
              : 'Nenhuma categoria passou do limite este mês.'}
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Plus className="w-4 h-4" /> Novo Orçamento
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
      ) : resumo.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="Nenhum orçamento definido"
          description="Defina um limite mensal para uma categoria e acompanhe o quanto já gastou."
          action={<button onClick={openCreate} className="btn-primary">Novo Orçamento</button>}
        />
      ) : (
        <div className="card space-y-4">
          {resumo.map((r) => {
            const pct = Math.min(100, r.percentUsed * 100);
            const budgetOriginal = budgets.find((b) => b.id === r.id);
            return (
              <div key={r.id} className="pb-4 border-b border-border last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.categoryColor }} />
                    <span className="text-sm font-medium text-ink">{r.categoryName}</span>
                    {r.estourado && (
                      <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" /> Estourou
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(budgetOriginal)} className="p-1.5 text-faint hover:text-brand-600 hover:bg-brand-50 rounded-lg">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeletingId(r.id)} className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted mb-1">
                  <span>{formatCurrency(r.spentCents / 100)} de {formatCurrency(r.limitCents / 100)}</span>
                  <span className={r.estourado ? 'text-red-600 font-medium' : ''}>{(r.percentUsed * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full bg-surface-alt overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: r.estourado ? '#dc2626' : r.percentUsed > 0.8 ? '#d97706' : '#0d9488' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? 'Editar Orçamento' : 'Novo Orçamento'} size="sm">
        <BudgetForm
          onSubmit={handleSubmit}
          categorias={editing ? categoriasDeDespesa : categoriasSemOrcamento}
          initialData={editingResumo}
          isLoading={saving}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Excluir orçamento?"
        message="O limite deixa de valer para esta categoria."
        loading={deleting}
      />
    </div>
  );
}
