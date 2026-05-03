import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

const ORIGINS = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
];

const STATUSES = [
  { value: 'CONFIRMED', label: 'Confirmado' },
  { value: 'PENDING', label: 'Pendente' },
];

export default function TransactionForm({ onSubmit, initialData, categories, paymentMethods, isLoading, payers = [] }) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      type: 'EXPENSE',
      date: format(new Date(), 'yyyy-MM-dd'),
      origin: 'MANUAL',
      status: 'CONFIRMED',
    },
  });

  const selectedType = watch('type');

  useEffect(() => {
    if (initialData) {
      reset({
        ...initialData,
        date: initialData.date
          ? format(new Date(initialData.date), 'yyyy-MM-dd')
          : format(new Date(), 'yyyy-MM-dd'),
        amount: Number(initialData.amount),
        categoryId: initialData.categoryId,
        paymentMethodId: initialData.paymentMethodId,
      });
    }
  }, [initialData, reset]);

  const filteredCategories = categories.filter(
    (c) => c.type === selectedType || c.type === 'BOTH'
  );

  async function handleFormSubmit(data) {
    await onSubmit({ ...data, amount: parseFloat(String(data.amount).replace(',', '.')) });
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Tipo */}
      <div>
        <label className="label">Tipo *</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'EXPENSE', label: '⬇ Despesa', cls: 'expense' },
            { value: 'INCOME', label: '⬆ Receita', cls: 'income' },
          ].map(({ value, label, cls }) => (
            <label
              key={value}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all text-sm font-medium
                ${selectedType === value
                  ? cls === 'expense'
                    ? 'border-red-400 bg-red-50 text-red-700'
                    : 'border-green-400 bg-green-50 text-green-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
            >
              <input type="radio" value={value} {...register('type')} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Descrição */}
      <div>
        <label className="label">Descrição *</label>
        <input
          className={`input ${errors.description ? 'border-red-400' : ''}`}
          placeholder="Ex: Mercado da semana"
          {...register('description', { required: 'Descrição obrigatória.' })}
        />
        {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description.message}</p>}
      </div>

      {/* Valor e Data */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Valor (R$) *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className={`input ${errors.amount ? 'border-red-400' : ''}`}
            placeholder="0,00"
            {...register('amount', {
              required: 'Valor obrigatório.',
              min: { value: 0.01, message: 'Valor deve ser maior que zero.' },
            })}
          />
          {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message}</p>}
        </div>
        <div>
          <label className="label">Data *</label>
          <input
            type="date"
            className={`input ${errors.date ? 'border-red-400' : ''}`}
            {...register('date', { required: 'Data obrigatória.' })}
          />
          {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date.message}</p>}
        </div>
      </div>

      {/* Categoria */}
      <div>
        <label className="label">Categoria *</label>
        <select
          className={`input ${errors.categoryId ? 'border-red-400' : ''}`}
          {...register('categoryId', { required: 'Categoria obrigatória.' })}
        >
          <option value="">Selecione a categoria</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {errors.categoryId && <p className="text-xs text-red-500 mt-1">{errors.categoryId.message}</p>}
      </div>

      {/* Forma de Pagamento */}
      <div>
        <label className="label">Forma de Pagamento *</label>
        <select
          className={`input ${errors.paymentMethodId ? 'border-red-400' : ''}`}
          {...register('paymentMethodId', { required: 'Forma de pagamento obrigatória.' })}
        >
          <option value="">Selecione a forma de pagamento</option>
          {paymentMethods.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        {errors.paymentMethodId && <p className="text-xs text-red-500 mt-1">{errors.paymentMethodId.message}</p>}
      </div>

      {/* Pago por */}
      {payers.length > 0 && (
        <div>
          <label className="label">Pago por</label>
          <select className="input" {...register('paidBy')}>
            <option value="">Não identificado</option>
            {payers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      )}

      {/* Status e Origem */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Status</label>
          <select className="input" {...register('status')}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Origem</label>
          <select className="input" {...register('origin')}>
            {ORIGINS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Observação */}
      <div>
        <label className="label">Observação</label>
        <textarea
          className="input resize-none"
          rows={2}
          placeholder="Observação opcional..."
          {...register('notes')}
        />
      </div>

      <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
        {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : 'Salvar Lançamento'}
      </button>
    </form>
  );
}
