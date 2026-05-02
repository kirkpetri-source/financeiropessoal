import { useState, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

export function useCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/categories');
      setCategories(data);
    } catch {
      toast.error('Erro ao carregar categorias.');
    } finally {
      setLoading(false);
    }
  }, []);

  const createCategory = useCallback(async (formData) => {
    const { data } = await api.post('/categories', formData);
    toast.success('Categoria criada!');
    return data;
  }, []);

  const updateCategory = useCallback(async (id, formData) => {
    const { data } = await api.put(`/categories/${id}`, formData);
    toast.success('Categoria atualizada!');
    return data;
  }, []);

  const deleteCategory = useCallback(async (id) => {
    await api.delete(`/categories/${id}`);
    toast.success('Categoria excluída.');
  }, []);

  return { categories, loading, fetchCategories, createCategory, updateCategory, deleteCategory };
}
