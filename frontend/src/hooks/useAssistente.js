import { useState, useCallback, useEffect } from 'react';
import api from '../services/api';

/**
 * Conversa com a assistente.
 *
 * O histórico vive no SERVIDOR, não aqui: a pessoa fecha o navegador, abre no
 * celular e a conversa continua de onde parou. O estado local é só o espelho
 * do que já foi carregado, mais a pergunta em voo.
 */
export function useAssistente() {
  const [mensagens, setMensagens] = useState([]);
  const [pensando, setPensando] = useState(false);
  const [uso, setUso] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [indisponivel, setIndisponivel] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const [hist, usoAtual] = await Promise.all([
        api.get('/assistente/historico'),
        api.get('/assistente/uso'),
      ]);

      if (hist.data?.ativa === false) {
        setIndisponivel('A assistente está temporariamente indisponível.');
        return;
      }

      setMensagens((hist.data?.mensagens || []).map((m, i) => ({
        id: `hist-${i}`,
        autor: m.papel === 'assistente' ? 'ia' : 'eu',
        texto: m.texto,
      })));
      setUso(usoAtual.data);
    } catch {
      // Falhar ao carregar o histórico não pode impedir de conversar: começa
      // uma conversa nova em vez de travar a tela num erro.
      setMensagens([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const perguntar = useCallback(async (texto) => {
    const pergunta = String(texto || '').trim();
    if (!pergunta || pensando) return;

    const marca = Date.now();
    setMensagens((atual) => [...atual, { id: `eu-${marca}`, autor: 'eu', texto: pergunta }]);
    setPensando(true);

    try {
      const { data } = await api.post('/assistente/perguntar', { pergunta });

      setMensagens((atual) => [...atual, {
        id: `ia-${marca}`,
        autor: 'ia',
        texto: data.texto,
        consultasUsadas: data.consultasUsadas || [],
      }]);

      if (data.uso) setUso((anterior) => ({ ...anterior, ...data.uso }));
    } catch (err) {
      const resposta = err.response?.data;

      // A recusa por limite diário JÁ vem escrita para o usuário, com a hora
      // do retorno e o que continua funcionando. Mostrar como bolha da própria
      // assistente é mais honesto que um toast de erro: não é falha, é a
      // conversa acabando por hoje.
      const texto = resposta?.error
        || 'Não consegui responder agora. Tente de novo em instantes.';

      setMensagens((atual) => [...atual, {
        id: `erro-${marca}`,
        autor: 'ia',
        texto,
        ehAviso: true,
      }]);

      if (resposta?.uso) setUso((anterior) => ({ ...anterior, ...resposta.uso }));
    } finally {
      setPensando(false);
    }
  }, [pensando]);

  const limpar = useCallback(async () => {
    await api.delete('/assistente/historico');
    setMensagens([]);
  }, []);

  return { mensagens, pensando, uso, carregando, indisponivel, perguntar, limpar };
}
