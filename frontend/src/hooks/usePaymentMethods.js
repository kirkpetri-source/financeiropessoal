import { useState, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

export function usePaymentMethods() {
  const [paymentMethods, setPaymentMethods] = useState([]);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      const { data } = await api.get('/payment-methods');
      setPaymentMethods(data);
    } catch {
      // silencioso — não bloquear a UI
    }
  }, []);

  const createPaymentMethod = useCallback(async (formData) => {
    const { data } = await api.post('/payment-methods', formData);
    toast.success('Forma de pagamento criada!');
    return data;
  }, []);

  const updatePaymentMethod = useCallback(async (id, formData) => {
    const { data } = await api.put(`/payment-methods/${id}`, formData);
    toast.success('Forma de pagamento atualizada!');
    return data;
  }, []);

  const deletePaymentMethod = useCallback(async (id) => {
    await api.delete(`/payment-methods/${id}`);
    toast.success('Forma de pagamento excluída.');
  }, []);

  return { paymentMethods, fetchPaymentMethods, createPaymentMethod, updatePaymentMethod, deletePaymentMethod };
}
