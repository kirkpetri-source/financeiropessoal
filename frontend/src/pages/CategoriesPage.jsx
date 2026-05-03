import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { useCategories } from '../hooks/useCategories';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const TYPE_LABELS = { INCOME: 'Receita', EXPENSE: 'Despesa', BOTH: 'Ambos' };
const TYPE_COLORS = {
  INCOME: 'bg-green-100 text-green-700',
  EXPENSE: 'bg-red-100 text-red-700',
  BOTH: 'bg-blue-100 text-blue-700',
};

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#94a3b8', '#1e40af',
];

function CategoryForm({ onSubmit, initialData, isLoading }) {
  const { register, handleSubmit, watch, setValue, formState: { errors }, reset } = useForm({
    defaultValues: { name: '', type: 'EXPENSE', color: '#3b82f6' },
  });

  const selectedColor = watch('color');

  useEffect(() => {
    if (initialData) reset({ name: initialData.name, type: initialData.type, color: initialData.color || '#3b82f6' });
    else reset({ name: '', type: 'EXPENSE', color: '#3b82f6' });
  }, [initialData, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="label">Nome *</label>
        <input className={`input ${errors.name ? 'border-red-400' : ''}`} placeholder="Nome da categoria" {...register('name', { required: 'Nome obrigatório.' })} />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
      </div>
      <div>
        <label className="label">Tipo *</label>
        <select className="input" {...register('type')}>
          <option value="EXPENSE">Despesa</option>
          <option value="INCOME">Receita</option>
          <option value="BOTH">Ambos</option>
        </select>
      </div>
      <div>
        <label className="label">Cor</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setValue('color', color)}
              className={`w-7 h-7 rounded-full transition-transform ${selectedColor === color ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110'}`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
      <button type="submit" disabled={isLoading} className="btn-primary w-full">
        {isLoading ? 'Salvando...' : initialData ? 'Salvar Alterações' : 'Criar Categoria'}
      </button>
    </form>
  );
}

export default function CategoriesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [filterType, setFilterType] = useState('');

  const { categories, loading, fetchCategories, createCategory, updateCategory, deleteCategory } = useCategories();

  useEffect(() => { fetchCategories(); }, []);

  function openCreate() { setEditingCategory(null); setModalOpen(true); }
  function openEdit(cat) {
    if (!cat.userId) { toast.error('Categorias padrão não podem ser editadas.'); return; }
    setEditingCategory(cat);
    setModalOpen(true);
  }

  async function handleSubmit(data) {
    setSaving(true);
    try {
      if (editingCategory) await updateCategory(editingCategory.id, data);
      else await createCategory(data);
      setModalOpen(false);
      setEditingCategory(null);
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar categoria.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteCategory(deletingId);
      setDeletingId(null);
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir categoria.');
    } finally {
      setDeleting(false);
    }
  }

  const filtered = filterType ? categories.filter(c => c.type === filterType || c.type === 'BOTH') : categories;
  const expenses = filtered.filter(c => c.type === 'EXPENSE' || c.type === 'BOTH');
  const incomes = filtered.filter(c => c.type === 'INCOME' || c.type === 'BOTH');

  function CategoryRow({ cat }) {
    return (
      <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || '#94a3b8' }} />
        <span className="text-sm text-gray-800 flex-1">{cat.name}</span>
        <span className={`hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[cat.type]}`}>
          {TYPE_LABELS[cat.type]}
        </span>
        {!cat.userId && <span className="hidden sm:inline text-xs text-gray-400">padrão</span>}
        <div className="flex gap-1">
          <button
            onClick={() => openEdit(cat)}
            disabled={!cat.userId}
            className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => cat.userId && setDeletingId(cat.id)}
            disabled={!cat.userId}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 flex-1 flex-wrap">
          {['', 'EXPENSE', 'INCOME'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${filterType === type ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
            >
              {type === '' ? 'Todas' : TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Plus className="w-4 h-4" /> Nova Categoria
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Tag} title="Nenhuma categoria" description="Crie sua primeira categoria." action={<button onClick={openCreate} className="btn-primary">Nova Categoria</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(!filterType || filterType === 'EXPENSE') && (
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" /> Despesas ({expenses.length})
              </h2>
              {expenses.length === 0 ? <p className="text-sm text-gray-400">Nenhuma categoria de despesa.</p> : expenses.map(c => <CategoryRow key={c.id} cat={c} />)}
            </div>
          )}
          {(!filterType || filterType === 'INCOME') && (
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400" /> Receitas ({incomes.length})
              </h2>
              {incomes.length === 0 ? <p className="text-sm text-gray-400">Nenhuma categoria de receita.</p> : incomes.map(c => <CategoryRow key={c.id} cat={c} />)}
            </div>
          )}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditingCategory(null); }} title={editingCategory ? 'Editar Categoria' : 'Nova Categoria'} size="sm">
        <CategoryForm onSubmit={handleSubmit} initialData={editingCategory} isLoading={saving} />
      </Modal>

      <ConfirmDialog
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Excluir categoria?"
        message="Esta ação não pode ser desfeita. A categoria não pode estar em uso."
        loading={deleting}
      />
    </div>
  );
}
