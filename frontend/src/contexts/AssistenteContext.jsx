import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

/**
 * A assistente está liberada para ESTA família?
 *
 * Quem decide é o backend (`ASSISTENTE_FAMILIAS` no ambiente), nunca o
 * frontend: o navegador não pode ter a lista de quem tem acesso, e mudar a
 * liberação não pode exigir publicar o site de novo. O painel só pergunta e
 * obedece.
 *
 * Existe como contexto pelo mesmo motivo do AssinaturaContext: dois lugares
 * precisam da mesma resposta ao mesmo tempo (o menu lateral e a própria tela
 * da assistente), e buscar em cada um daria duas requisições por navegação.
 *
 * COMEÇA ESCONDIDO, de propósito. Enquanto a resposta não chega, o item não
 * aparece — melhor um menu que ganha uma linha depois de meio segundo do que
 * um item que pisca e some, ou pior, um item clicável que leva a "assistente
 * indisponível" para quem não tem acesso.
 */

const AssistenteContext = createContext(null);

export function AssistenteProvider({ children }) {
  const { user } = useAuth();
  const [disponivel, setDisponivel] = useState(false);
  const [carregou, setCarregou] = useState(false);

  const buscar = useCallback(async () => {
    try {
      const { data } = await api.get('/assistente/uso');
      setDisponivel(data?.ativa === true);
    } catch {
      // Sem família ainda, assinatura vencida, API fora do ar: some do menu.
      // Esconder demais é um item a menos; mostrar demais é uma promessa que
      // o clique não cumpre.
      setDisponivel(false);
    } finally {
      setCarregou(true);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setDisponivel(false);
      setCarregou(false);
      return;
    }
    buscar();
  }, [user, buscar]);

  return (
    <AssistenteContext.Provider value={{ disponivel, carregou, recarregar: buscar }}>
      {children}
    </AssistenteContext.Provider>
  );
}

export function useAssistenteDisponivel() {
  const ctx = useContext(AssistenteContext);
  // Fora do provider (um teste, uma tela solta) o item simplesmente não
  // aparece, em vez de quebrar a renderização inteira.
  return ctx || { disponivel: false, carregou: false, recarregar: () => {} };
}
