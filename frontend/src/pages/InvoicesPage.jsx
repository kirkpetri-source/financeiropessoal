import { useEffect, useState } from 'react';
import { Plus, CreditCard, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { useInvoices } from '../hooks/useInvoices';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatCurrency, formatDate } from '../utils/formatters';

const STATUS_LABEL = { aberta: 'Em aberto', fechada: 'Fechada', paga: 'Paga' };
const STATUS_COLOR = {
  aberta: 'bg-blue-100 text-blue-800',
  fechada: 'bg-amber-100 text-amber-800',
  paga: 'bg-green-100 text-green-800',
};

function CardForm({ onSubmit, isLoading }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { name: '', closingDay: '', dueDay: '' },
  });

  function aoEnviar(data) {
    onSubmit({
      name: data.name,
      isCreditCard: true,
      closingDay: Number(data.closingDay),
      dueDay: Number(data.dueDay),
    });
  }

  return (
    <form onSubmit={handleSubmit(aoEnviar)} className="space-y-4">
      <div>
        <label className="label">Nome do cartão *</label>
        <input className={`input ${errors.name ? 'border-red-400' : ''}`} placeholder="Ex: Nubank" {...register('name', { required: 'Nome obrigatório.' })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Dia do fechamento *</label>
          <input type="number" min="1" max="31" className="input" {...register('closingDay', { required: true, min: 1, max: 31 })} />
        </div>
        <div>
          <label className="label">Dia do vencimento *</label>
          <input type="number" min="1" max="31" className="input" {...register('dueDay', { required: true, min: 1, max: 31 })} />
        </div>
      </div>
      <p className="text-xs text-faint">
        Compra feita depois do fechamento entra na fatura seguinte, não na que está prestes a vencer.
      </p>
      <button type="submit" disabled={isLoading} className="btn-primary w-full">
        {isLoading ? 'Salvando...' : 'Cadastrar Cartão'}
      </button>
    </form>
  );
}

export default function InvoicesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cartaoSelecionado, setCartaoSelecionado] = useState(null);
  const [pagando, setPagando] = useState(null);

  const { paymentMethods, fetchPaymentMethods, createPaymentMethod } = usePaymentMethods();
  const { aberta, historico, loading, fetchAberta, fetchHistorico, marcarComoPaga } = useInvoices();

  useEffect(() => { fetchPaymentMethods(); }, []);

  const cartoes = paymentMethods.filter((p) => p.isCreditCard);

  useEffect(() => {
    if (!cartaoSelecionado && cartoes.length > 0) setCartaoSelecionado(cartoes[0].id);
  }, [cartoes, cartaoSelecionado]);

  useEffect(() => {
    if (cartaoSelecionado) {
      fetchAberta(cartaoSelecionado);
      fetchHistorico(cartaoSelecionado);
    }
  }, [cartaoSelecionado, fetchAberta, fetchHistorico]);

  async function handleCreateCard(data) {
    setSaving(true);
    try {
      const criado = await createPaymentMethod(data);
      setModalOpen(false);
      await fetchPaymentMethods();
      setCartaoSelecionado(criado.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cadastrar cartão.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePagar(invoiceId) {
    setPagando(invoiceId);
    try {
      await marcarComoPaga(invoiceId);
      await fetchHistorico(cartaoSelecionado);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao marcar fatura como paga.');
    } finally {
      setPagando(null);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-ink">Faturas de cartão</h1>
          <p className="text-sm text-muted">Fechamento, vencimento e histórico por cartão.</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Plus className="w-4 h-4" /> Novo Cartão
        </button>
      </div>

      {cartoes.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum cartão de crédito cadastrado"
          description="Cadastre um cartão com dia de fechamento e vencimento para acompanhar a fatura."
          action={<button onClick={() => setModalOpen(true)} className="btn-primary">Novo Cartão</button>}
        />
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            {cartoes.map((c) => (
              <button
                key={c.id}
                onClick={() => setCartaoSelecionado(c.id)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${cartaoSelecionado === c.id ? 'bg-brand-600 text-white' : 'bg-white text-muted border border-border-strong hover:bg-surface-alt'}`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
          ) : (
            <>
              {aberta && (
                <div className="card">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-ink">Fatura em aberto</h2>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR.aberta}`}>Em aberto</span>
                  </div>
                  <p className="text-2xl font-bold text-ink">{formatCurrency(aberta.totalCents / 100)}</p>
                  <p className="text-xs text-faint mt-1">
                    {aberta.transacoes} lançamento{aberta.transacoes !== 1 ? 's' : ''} · fecha em {formatDate(aberta.closingDate)} · vence em {formatDate(aberta.dueDate)}
                  </p>
                </div>
              )}

              <div className="card p-0 overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h2 className="text-sm font-semibold text-ink">Histórico</h2>
                </div>
                {historico.length === 0 ? (
                  <p className="text-sm text-faint px-4 py-6 text-center">Nenhuma fatura fechada ainda.</p>
                ) : (
                  historico.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink">{f.referenceCycle}</p>
                        <p className="text-xs text-faint">vence em {formatDate(f.dueDate)}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[f.status] || ''}`}>
                        {STATUS_LABEL[f.status] || f.status}
                      </span>
                      <span className="text-sm font-medium text-ink w-24 text-right">{formatCurrency(f.totalCents / 100)}</span>
                      {f.status === 'fechada' && (
                        <button
                          onClick={() => handlePagar(f.id)}
                          disabled={pagando === f.id}
                          className="btn-secondary text-xs flex items-center gap-1 whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> {pagando === f.id ? 'Marcando...' : 'Marcar como paga'}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Novo Cartão" size="sm">
        <CardForm onSubmit={handleCreateCard} isLoading={saving} />
      </Modal>
    </div>
  );
}
