import { useState, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

export function useInvoices() {
  const [aberta, setAberta] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAberta = useCallback(async (paymentMethodId) => {
    setLoading(true);
    try {
      const { data } = await api.get('/faturas/aberta', { params: { paymentMethodId } });
      setAberta(data);
      return data;
    } catch (err) {
      setAberta(null);
      if (err.response?.status !== 409) toast.error('Erro ao carregar a fatura aberta.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistorico = useCallback(async (paymentMethodId) => {
    try {
      const { data } = await api.get('/faturas/historico', { params: { paymentMethodId } });
      setHistorico(data);
      return data;
    } catch {
      toast.error('Erro ao carregar o histórico de faturas.');
      return [];
    }
  }, []);

  const marcarComoPaga = useCallback(async (invoiceId) => {
    const { data } = await api.post(`/faturas/${invoiceId}/pagar`);
    toast.success('Fatura marcada como paga!');
    return data;
  }, []);

  return { aberta, historico, loading, fetchAberta, fetchHistorico, marcarComoPaga };
}
