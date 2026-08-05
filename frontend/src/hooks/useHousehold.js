import { useState, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * Dados da família: membros, papel de quem está logado e permissões.
 *
 * Substitui a lista de "payers" que ficava dentro da configuração do WhatsApp.
 * Membro da família é uma entidade de verdade — tem papel, telefone e, quando
 * criar conta, login próprio. A lista antiga era só um apoio para o parser.
 */
export function useHousehold() {
  const [household, setHousehold] = useState(null);
  const [membros, setMembros] = useState([]);
  const [carregando, setCarregando] = useState(false);

  const buscarHousehold = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await api.get('/households/atual');
      setHousehold(data);
      setMembros(data.membros || []);
      return data;
    } catch (err) {
      if (err.response?.data?.codigo !== 'SEM_HOUSEHOLD') {
        toast.error('Erro ao carregar dados da família.');
      }
      return null;
    } finally {
      setCarregando(false);
    }
  }, []);

  const adicionarMembro = useCallback(async (membro) => {
    const { data } = await api.post('/households/atual/membros', membro);
    setMembros(data);
    toast.success('Membro adicionado!');
    return data;
  }, []);

  const atualizarMembro = useCallback(async (userId, dados) => {
    const { data } = await api.put(`/households/atual/membros/${userId}`, dados);
    setMembros(data);
    return data;
  }, []);

  const removerMembro = useCallback(async (userId) => {
    const { data } = await api.delete(`/households/atual/membros/${userId}`);
    setMembros(data);
    toast.success('Membro removido.');
    return data;
  }, []);

  const renomearFamilia = useCallback(async (nome) => {
    const { data } = await api.put('/households/atual', { nome });
    setHousehold((atual) => ({ ...atual, ...data }));
    toast.success('Nome da família atualizado!');
    return data;
  }, []);

  // Só os nomes — é o formato que os filtros e formulários consomem.
  const nomesDosMembros = membros.map((m) => m.name).filter(Boolean);

  return {
    household,
    membros,
    nomesDosMembros,
    carregando,
    permissoes: household?.minhasPermissoes || {},
    meuPapel: household?.meuPapel || null,
    buscarHousehold,
    adicionarMembro,
    atualizarMembro,
    removerMembro,
    renomearFamilia,
  };
}
