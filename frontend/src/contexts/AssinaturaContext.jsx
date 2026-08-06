import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api, { EVENTO_ASSINATURA_INATIVA } from '../services/api';
import { useAuth } from './AuthContext';

/**
 * Situação da assinatura, compartilhada pelo app inteiro.
 *
 * Fica em contexto, e não num hook por página, porque três lugares precisam do
 * mesmo estado ao mesmo tempo: o banner do topo, a tela de assinatura e o
 * bloqueio dos botões de lançar. Buscar em cada um dava três requisições por
 * navegação e, pior, deixava a tela mostrando "trial ativo" logo depois de o
 * cliente pagar.
 */

const AssinaturaContext = createContext(null);

const VAZIO = {
  podeLancar: true, // otimista até a primeira resposta: nada pisca bloqueado
  motivo: null,
  emTrial: false,
  emCarencia: false,
  diasRestantes: null,
  mensagem: '',
};

export function AssinaturaProvider({ children }) {
  const { user } = useAuth();
  const [assinatura, setAssinatura] = useState(VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [carregou, setCarregou] = useState(false);

  const buscar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await api.get('/subscription');
      setAssinatura(data);
      return data;
    } catch {
      // Sem família configurada ainda (409) ou API fora do ar: não é hora de
      // bloquear ninguém — o backend bloqueia de verdade na hora de gravar.
      return null;
    } finally {
      setCarregando(false);
      setCarregou(true);
    }
  }, []);

  useEffect(() => {
    if (user) buscar();
  }, [user, buscar]);

  // O backend recusou uma gravação por assinatura: busca a situação de novo
  // para o banner e o menu refletirem o bloqueio na hora.
  useEffect(() => {
    function aoBloquear() { buscar(); }
    window.addEventListener(EVENTO_ASSINATURA_INATIVA, aoBloquear);
    return () => window.removeEventListener(EVENTO_ASSINATURA_INATIVA, aoBloquear);
  }, [buscar]);

  const iniciarCheckout = useCallback(async (email) => {
    const { data } = await api.post('/subscription/checkout', email ? { email } : {});
    return data;
  }, []);

  /** Volta do Mercado Pago antes do webhook: pergunta o status na hora. */
  const sincronizar = useCallback(async () => {
    const { data } = await api.post('/subscription/sincronizar');
    setAssinatura(data);
    return data;
  }, []);

  const cancelar = useCallback(async (motivo) => {
    const { data } = await api.post('/subscription/cancelar', { motivo: motivo || null });
    setAssinatura(data);
    return data;
  }, []);

  return (
    <AssinaturaContext.Provider
      value={{ assinatura, carregando, carregou, buscar, iniciarCheckout, sincronizar, cancelar }}
    >
      {children}
    </AssinaturaContext.Provider>
  );
}

export function useAssinatura() {
  const ctx = useContext(AssinaturaContext);
  if (!ctx) throw new Error('useAssinatura deve ser usado dentro de AssinaturaProvider');
  return ctx;
}
