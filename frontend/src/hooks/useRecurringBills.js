import { useState, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

export function useRecurringBills() {
  const [bills, setBills] = useState([]);
  const [proximas, setProximas] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/recurring-bills');
      setBills(data);
    } catch {
      toast.error('Erro ao carregar contas fixas.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProximas = useCallback(async () => {
    try {
      const { data } = await api.get('/recurring-bills/proximas');
      setProximas(data);
      return data;
    } catch {
      return [];
    }
  }, []);

  const createBill = useCallback(async (formData) => {
    const { data } = await api.post('/recurring-bills', formData);
    toast.success('Conta fixa criada!');
    return data;
  }, []);

  const updateBill = useCallback(async (id, formData) => {
    const { data } = await api.put(`/recurring-bills/${id}`, formData);
    toast.success('Conta fixa atualizada!');
    return data;
  }, []);

  const deleteBill = useCallback(async (id) => {
    await api.delete(`/recurring-bills/${id}`);
    toast.success('Conta fixa excluída.');
  }, []);

  return { bills, proximas, loading, fetchBills, fetchProximas, createBill, updateBill, deleteBill };
}
