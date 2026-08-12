import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Tag, ChevronDown, ChevronRight } from 'lucide-react';
import { useCategories } from '../hooks/useCategories';
import { useSubcategories } from '../hooks/useSubcategories';
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
              className={`w-7 h-7 rounded-full transition-transform ${selectedColor === color ? 'scale-125 ring-2 ring-offset-2 ring-border-strong' : 'hover:scale-110'}`}
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

function SubcategoryForm({ onSubmit, initialData, isLoading }) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    defaultValues: { name: '' },
  });

  useEffect(() => {
    reset({ name: initialData?.name || '' });
  }, [initialData, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="label">Nome *</label>
        <input className={`input ${errors.name ? 'border-red-400' : ''}`} placeholder="Nome da subcategoria" {...register('name', { required: 'Nome obrigatório.' })} />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
      </div>
      <button type="submit" disabled={isLoading} className="btn-primary w-full">
        {isLoading ? 'Salvando...' : initialData ? 'Salvar Alterações' : 'Criar Subcategoria'}
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
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const [subModalOpen, setSubModalOpen] = useState(false);
  const [subParentId, setSubParentId] = useState(null);
  const [editingSubcategory, setEditingSubcategory] = useState(null);
  const [deletingSubId, setDeletingSubId] = useState(null);
  const [savingSub, setSavingSub] = useState(false);
  const [deletingSub, setDeletingSub] = useState(false);

  const { categories, loading, fetchCategories, createCategory, updateCategory, deleteCategory } = useCategories();
  const {
    subcategories, fetchSubcategories, createSubcategory, updateSubcategory, deleteSubcategory,
  } = useSubcategories();

  useEffect(() => { fetchCategories(); fetchSubcategories(); }, []);

  function toggleExpanded(categoryId) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function openCreate() { setEditingCategory(null); setModalOpen(true); }
  function openEdit(cat) {
    if (cat.isDefault) { toast.error('Categorias padrão não podem ser editadas.'); return; }
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

  function openCreateSub(categoryId) {
    setSubParentId(categoryId);
    setEditingSubcategory(null);
    setSubModalOpen(true);
  }

  function openEditSub(sub) {
    setSubParentId(sub.categoryId);
    setEditingSubcategory(sub);
    setSubModalOpen(true);
  }

  async function handleSubmitSub(data) {
    setSavingSub(true);
    try {
      const payload = { name: data.name, categoryId: subParentId };
      if (editingSubcategory) await updateSubcategory(editingSubcategory.id, payload);
      else await createSubcategory(payload);
      setSubModalOpen(false);
      setEditingSubcategory(null);
      setSubParentId(null);
      fetchSubcategories();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar subcategoria.');
    } finally {
      setSavingSub(false);
    }
  }

  async function handleDeleteSub() {
    setDeletingSub(true);
    try {
      await deleteSubcategory(deletingSubId);
      setDeletingSubId(null);
      fetchSubcategories();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir subcategoria.');
    } finally {
      setDeletingSub(false);
    }
  }

  const filtered = filterType ? categories.filter(c => c.type === filterType || c.type === 'BOTH') : categories;
  const expenses = filtered.filter(c => c.type === 'EXPENSE' || c.type === 'BOTH');
  const incomes = filtered.filter(c => c.type === 'INCOME' || c.type === 'BOTH');

  function CategoryRow({ cat }) {
    const subs = subcategories.filter((s) => s.categoryId === cat.id);
    const expanded = expandedIds.has(cat.id);

    return (
      <div className="border-b border-border last:border-0">
        <div className="flex items-center gap-3 py-2.5">
          <button
            onClick={() => toggleExpanded(cat.id)}
            className="p-0.5 text-faint hover:text-ink flex-shrink-0"
            aria-label={expanded ? 'Recolher subcategorias' : 'Expandir subcategorias'}
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || '#94a3b8' }} />
          <span className="text-sm text-ink flex-1">
            {cat.name}
            {subs.length > 0 && <span className="text-faint font-normal"> ({subs.length})</span>}
          </span>
          <span className={`hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[cat.type]}`}>
            {TYPE_LABELS[cat.type]}
          </span>
          {cat.isDefault && <span className="hidden sm:inline text-xs text-faint">padrão</span>}
          <div className="flex gap-1">
            <button
              onClick={() => openEdit(cat)}
              disabled={cat.isDefault}
              className="p-1.5 text-faint hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => !cat.isDefault && setDeletingId(cat.id)}
              disabled={cat.isDefault}
              className="p-1.5 text-faint hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="pl-8 pb-2.5 space-y-1.5">
            {subs.length === 0 && <p className="text-xs text-faint">Nenhuma subcategoria.</p>}
            {subs.map((sub) => (
              <div key={sub.id} className="flex items-center gap-3 text-sm text-muted">
                <span className="flex-1">{sub.name}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEditSub(sub)}
                    className="p-1 text-faint hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setDeletingSubId(sub.id)}
                    className="p-1 text-faint hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => openCreateSub(cat.id)}
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium pt-1"
            >
              <Plus className="w-3 h-3" /> Subcategoria
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div id="tour-categories" className="space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 flex-1 flex-wrap">
          {['', 'EXPENSE', 'INCOME'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${filterType === type ? 'bg-brand-600 text-white' : 'bg-white text-muted border border-border-strong hover:bg-surface-alt'}`}
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
              <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" /> Despesas ({expenses.length})
              </h2>
              {expenses.length === 0 ? <p className="text-sm text-faint">Nenhuma categoria de despesa.</p> : expenses.map(c => <CategoryRow key={c.id} cat={c} />)}
            </div>
          )}
          {(!filterType || filterType === 'INCOME') && (
            <div className="card">
              <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400" /> Receitas ({incomes.length})
              </h2>
              {incomes.length === 0 ? <p className="text-sm text-faint">Nenhuma categoria de receita.</p> : incomes.map(c => <CategoryRow key={c.id} cat={c} />)}
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
        message="Esta ação não pode ser desfeita. A categoria não pode estar em uso nem ter subcategorias cadastradas."
        loading={deleting}
      />

      <Modal
        isOpen={subModalOpen}
        onClose={() => { setSubModalOpen(false); setEditingSubcategory(null); setSubParentId(null); }}
        title={editingSubcategory ? 'Editar Subcategoria' : 'Nova Subcategoria'}
        size="sm"
      >
        <SubcategoryForm onSubmit={handleSubmitSub} initialData={editingSubcategory} isLoading={savingSub} />
      </Modal>

      <ConfirmDialog
        isOpen={!!deletingSubId}
        onClose={() => setDeletingSubId(null)}
        onConfirm={handleDeleteSub}
        title="Excluir subcategoria?"
        message="Esta ação não pode ser desfeita. A subcategoria não pode estar em uso em lançamentos."
        loading={deletingSub}
      />
    </div>
  );
}
