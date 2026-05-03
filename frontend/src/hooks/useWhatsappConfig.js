import { useState, useCallback } from 'react';
import api from '../services/api';

export function useWhatsappConfig() {
  const [payers, setPayers] = useState([]);

  const fetchPayers = useCallback(async () => {
    try {
      const { data } = await api.get('/whatsapp/config');
      // Retorna apenas os nomes (strings) para usar nos filtros e formulários
      const names = (data.payers || [])
        .map(p => typeof p === 'string' ? p : p.name)
        .filter(Boolean);
      setPayers(names);
    } catch {
      // silencioso
    }
  }, []);

  return { payers, fetchPayers };
}
