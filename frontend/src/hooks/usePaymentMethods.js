import { useState, useCallback } from 'react';
import api from '../services/api';

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

  return { paymentMethods, fetchPaymentMethods };
}
