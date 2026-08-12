import { useState, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

export function useSubcategories() {
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchSubcategories = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/subcategories');
      setSubcategories(data);
    } catch {
      toast.error('Erro ao carregar subcategorias.');
    } finally {
      setLoading(false);
    }
  }, []);

  const createSubcategory = useCallback(async (formData) => {
    const { data } = await api.post('/subcategories', formData);
    toast.success('Subcategoria criada!');
    return data;
  }, []);

  const updateSubcategory = useCallback(async (id, formData) => {
    const { data } = await api.put(`/subcategories/${id}`, formData);
    toast.success('Subcategoria atualizada!');
    return data;
  }, []);

  const deleteSubcategory = useCallback(async (id) => {
    await api.delete(`/subcategories/${id}`);
    toast.success('Subcategoria excluída.');
  }, []);

  return { subcategories, loading, fetchSubcategories, createSubcategory, updateSubcategory, deleteSubcategory };
}
