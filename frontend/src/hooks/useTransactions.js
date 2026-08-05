import { useState, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

export function useTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchTransactions = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      );
      const { data } = await api.get('/transactions', { params });
      setTransactions(data);
    } catch {
      toast.error('Erro ao carregar lançamentos.');
    } finally {
      setLoading(false);
    }
  }, []);

  // paidBy vai ao backend: o filtro por pessoa agora vale para graficos e
  // listas, nao so para os quatro totais como era antes.
  const fetchSummary = useCallback(async (month, paidBy = null) => {
    try {
      const params = paidBy ? { month, paidBy } : { month };
      const { data } = await api.get('/transactions/summary', { params });
      setSummary(data);
    } catch {
      toast.error('Erro ao carregar resumo.');
    }
  }, []);

  const createTransaction = useCallback(async (formData) => {
    const { data } = await api.post('/transactions', formData);
    toast.success('Lançamento criado com sucesso!');
    return data;
  }, []);

  const updateTransaction = useCallback(async (id, formData) => {
    const { data } = await api.put(`/transactions/${id}`, formData);
    toast.success('Lançamento atualizado!');
    return data;
  }, []);

  const deleteTransaction = useCallback(async (id) => {
    await api.delete(`/transactions/${id}`);
    toast.success('Lançamento excluído.');
  }, []);

  return {
    transactions,
    summary,
    loading,
    fetchTransactions,
    fetchSummary,
    createTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
