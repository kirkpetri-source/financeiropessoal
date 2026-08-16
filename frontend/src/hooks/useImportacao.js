import { useState, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * Importação de extrato bancário.
 *
 * O arquivo é lido no NAVEGADOR e enviado como texto: extrato de banco é
 * texto puro (OFX/CSV), e mandar string simples evita multipart no backend.
 * O servidor guarda o rascunho e devolve um id — daí em diante a tela trabalha
 * por índice, sem nunca reenviar valor ou data.
 */
export function useImportacao() {
  const [preview, setPreview] = useState(null);
  const [analisando, setAnalisando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [lotes, setLotes] = useState([]);

  const analisar = useCallback(async (arquivo) => {
    setAnalisando(true);
    try {
      const conteudo = await arquivo.text();
      const { data } = await api.post('/importacao/analisar', {
        conteudo,
        nomeArquivo: arquivo.name,
      });
      setPreview(data);
      return data;
    } catch (err) {
      const resposta = err.response?.data;
      // 403 RECURSO_DE_ASSINANTE é a mensagem do portão de assinante; as demais
      // vêm do leitor de extrato (formato desconhecido, arquivo grande, só mês
      // corrente) e já chegam prontas para o usuário.
      toast.error(resposta?.error || 'Não consegui ler este arquivo.');
      throw err;
    } finally {
      setAnalisando(false);
    }
  }, []);

  const confirmar = useCallback(async (batchId, escolhas) => {
    setConfirmando(true);
    try {
      const { data } = await api.post(`/importacao/${batchId}/confirmar`, { escolhas });
      return data;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não consegui concluir a importação.');
      throw err;
    } finally {
      setConfirmando(false);
    }
  }, []);

  const desfazer = useCallback(async (batchId) => {
    const { data } = await api.post(`/importacao/${batchId}/desfazer`);
    toast.success(`${data.apagadas} lançamento(s) removido(s).`);
    return data;
  }, []);

  const listarLotes = useCallback(async () => {
    try {
      const { data } = await api.get('/importacao');
      setLotes(data);
      return data;
    } catch {
      return [];
    }
  }, []);

  return {
    preview, setPreview, analisar, analisando,
    confirmar, confirmando, desfazer, lotes, listarLotes,
  };
}
