import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, CalendarClock, Power } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useRecurringBills } from '../hooks/useRecurringBills';
import { useCategories } from '../hooks/useCategories';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatCurrency, formatDate } from '../utils/formatters';

function BillForm({ onSubmit, categorias, formasDePagamento, initialData, isLoading }) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    defaultValues: { description: '', amount: '', type: 'EXPENSE', dueDay: '', categoryId: '', paymentMethodId: '' },
  });

  useEffect(() => {
    if (initialData) {
      reset({
        description: initialData.description,
        amount: (initialData.amountCents / 100).toFixed(2),
        type: initialData.type,
        dueDay: initialData.dueDay,
        categoryId: initialData.categoryId,
        paymentMethodId: initialData.paymentMethodId,
      });
    } else {
      reset({ description: '', amount: '', type: 'EXPENSE', dueDay: '', categoryId: '', paymentMethodId: '' });
    }
  }, [initialData, reset]);

  function aoEnviar(data) {
    onSubmit({
      description: data.description,
      amount: undefined,
      amountCents: Math.round(Number(String(data.amount).replace(',', '.')) * 100),
      type: data.type,
      dueDay: Number(data.dueDay),
      categoryId: data.categoryId,
      paymentMethodId: data.paymentMethodId,
    });
  }

  return (
    <form onSubmit={handleSubmit(aoEnviar)} className="space-y-4">
      <div>
        <label className="label">Descrição *</label>
        <input className={`input ${errors.description ? 'border-red-400' : ''}`} placeholder="Ex: Aluguel" {...register('description', { required: 'Descrição obrigatória.' })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Valor (R$) *</label>
          <input className="input" placeholder="1500,00" {...register('amount', { required: true })} />
        </div>
        <div>
          <label className="label">Dia do vencimento *</label>
          <input type="number" min="1" max="31" className="input" {...register('dueDay', { required: true, min: 1, max: 31 })} />
        </div>
      </div>
      <div>
        <label className="label">Tipo *</label>
        <select className="input" {...register('type')}>
          <option value="EXPENSE">Despesa</option>
          <option value="INCOME">Receita</option>
        </select>
      </div>
      <div>
        <label className="label">Categoria *</label>
        <select className="input" {...register('categoryId', { required: true })}>
          <option value="">Selecione</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Forma de pagamento *</label>
        <select className="input" {...register('paymentMethodId', { required: true })}>
          <option value="">Selecione</option>
          {formasDePagamento.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <button type="submit" disabled={isLoading} className="btn-primary w-full">
        {isLoading ? 'Salvando...' : initialData ? 'Salvar Alterações' : 'Criar Conta Fixa'}
      </button>
    </form>
  );
}

export default function RecurringBillsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { bills, proximas, loading, fetchBills, fetchProximas, createBill, updateBill, deleteBill } = useRecurringBills();
  const { categories, fetchCategories } = useCategories();
  const { paymentMethods, fetchPaymentMethods } = usePaymentMethods();

  async function carregarTudo() {
    await fetchBills();
    await fetchProximas();
  }

  useEffect(() => { carregarTudo(); fetchCategories(); fetchPaymentMethods(); }, []);

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(bill) { setEditing(bill); setModalOpen(true); }

  async function handleSubmit(data) {
    setSaving(true);
    try {
      if (editing) await updateBill(editing.id, data);
      else await createBill(data);
      setModalOpen(false);
      setEditing(null);
      carregarTudo();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar conta fixa.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtiva(bill) {
    try {
      await updateBill(bill.id, { active: !bill.active });
      carregarTudo();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar conta fixa.');
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteBill(deletingId);
      setDeletingId(null);
      carregarTudo();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir conta fixa.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-ink">Contas fixas recorrentes</h1>
          <p className="text-sm text-muted">Lançadas sozinhas todo mês, no dia do vencimento.</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Plus className="w-4 h-4" /> Nova Conta Fixa
        </button>
      </div>

      {proximas.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-brand-dark" /> Próximas a vencer
          </h2>
          <div className="space-y-2">
            {proximas.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">{p.description}</span>
                <span className="text-muted">{formatDate(p.proximaData)} · {formatCurrency(p.amountCents / 100)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
      ) : bills.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nenhuma conta fixa cadastrada"
          description="Aluguel, mensalidade, assinatura — o que se repete todo mês."
          action={<button onClick={openCreate} className="btn-primary">Nova Conta Fixa</button>}
        />
      ) : (
        <div className="card p-0 overflow-hidden">
          {bills.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${b.active ? 'text-ink' : 'text-faint line-through'}`}>{b.description}</p>
                <p className="text-xs text-faint">
                  Dia {b.dueDay} · {b.category?.name} · {b.paymentMethod?.name}
                </p>
              </div>
              <span className={`text-sm font-medium ${b.type === 'INCOME' ? 'income-text' : 'expense-text'}`}>
                {formatCurrency(b.amountCents / 100)}
              </span>
              <div className="flex gap-1">
                <button onClick={() => toggleAtiva(b)} title={b.active ? 'Pausar' : 'Reativar'} className={`p-1.5 rounded-lg hover:bg-surface-alt ${b.active ? 'text-brand-600' : 'text-faint'}`}>
                  <Power className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => openEdit(b)} className="p-1.5 text-faint hover:text-brand-600 hover:bg-brand-50 rounded-lg">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setDeletingId(b.id)} className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 rounded-lg">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? 'Editar Conta Fixa' : 'Nova Conta Fixa'} size="sm">
        <BillForm onSubmit={handleSubmit} categorias={categories} formasDePagamento={paymentMethods} initialData={editing} isLoading={saving} />
      </Modal>

      <ConfirmDialog
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Excluir conta fixa?"
        message="Deixa de ser lançada automaticamente. Lançamentos já feitos não são apagados."
        loading={deleting}
      />
    </div>
  );
}
