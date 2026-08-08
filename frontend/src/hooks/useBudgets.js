import { useState, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

export function useBudgets() {
  const [budgets, setBudgets] = useState([]);
  const [resumo, setResumo] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/budgets');
      setBudgets(data);
    } catch {
      toast.error('Erro ao carregar orçamentos.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchResumo = useCallback(async (month) => {
    try {
      const { data } = await api.get('/budgets/resumo', { params: month ? { month } : {} });
      setResumo(data);
      return data;
    } catch {
      toast.error('Erro ao carregar o resumo do orçamento.');
      return [];
    }
  }, []);

  const createBudget = useCallback(async (formData) => {
    const { data } = await api.post('/budgets', formData);
    toast.success('Orçamento criado!');
    return data;
  }, []);

  const updateBudget = useCallback(async (id, formData) => {
    const { data } = await api.put(`/budgets/${id}`, formData);
    toast.success('Orçamento atualizado!');
    return data;
  }, []);

  const deleteBudget = useCallback(async (id) => {
    await api.delete(`/budgets/${id}`);
    toast.success('Orçamento excluído.');
  }, []);

  return { budgets, resumo, loading, fetchBudgets, fetchResumo, createBudget, updateBudget, deleteBudget };
}
