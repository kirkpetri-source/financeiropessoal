import { useState, useCallback } from 'react';
import api from '../services/api';

export function useWhatsappConfig() {
  const [payers, setPayers] = useState([]);

  const fetchPayers = useCallback(async () => {
    try {
      const { data } = await api.get('/whatsapp/config');
      setPayers(data.payers || []);
    } catch {
      // silencioso
    }
  }, []);

  return { payers, fetchPayers };
}
