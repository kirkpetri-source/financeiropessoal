import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';

export const CATEGORIAS = [
  { valor: 'DUVIDA', rotulo: 'Dúvida' },
  { valor: 'PROBLEMA', rotulo: 'Problema' },
  { valor: 'COBRANCA', rotulo: 'Cobrança' },
  { valor: 'SUGESTAO', rotulo: 'Sugestão' },
];

export const STATUS = {
  ABERTO: { rotulo: 'Aberto', tom: 'aberto' },
  EM_ANDAMENTO: { rotulo: 'Em andamento', tom: 'aberto' },
  AGUARDANDO_CLIENTE: { rotulo: 'Aguardando você', tom: 'atencao' },
  RESOLVIDO: { rotulo: 'Resolvido', tom: 'ok' },
};

export const LIMITE_CARACTERES = 5000;
export const LIMITE_ANEXOS = 5;
export const LIMITE_BYTES = 5 * 1024 * 1024;
export const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'application/pdf'];

/** Arquivo do input vira base64 puro, sem o prefixo `data:`. */
function paraBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(',')[1] || '');
    leitor.onerror = () => reject(new Error(`Não consegui ler ${arquivo.name}.`));
    leitor.readAsDataURL(arquivo);
  });
}

export function useChamados() {
  const [chamados, setChamados] = useState([]);
  const [carregando, setCarregando] = useState(false);

  const listar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await api.get('/suporte/chamados');
      setChamados(data);
      return data;
    } catch {
      toast.error('Não consegui carregar seus chamados.');
      return [];
    } finally {
      setCarregando(false);
    }
  }, []);

  const buscar = useCallback(async (numero) => {
    const { data } = await api.get(`/suporte/chamados/${numero}`);
    return data;
  }, []);

  /**
   * Sobe os arquivos ANTES da mensagem e devolve os caminhos.
   *
   * Se um falhar, os outros seguem: o backend responde 200 com a lista do que
   * deu errado. A mensagem que a pessoa escreveu vale mais que o terceiro
   * anexo dela — ela reenvia só o arquivo.
   */
  const subirAnexos = useCallback(async (arquivos) => {
    if (!arquivos?.length) return { caminhos: [], falharam: [] };

    const payload = await Promise.all(
      arquivos.map(async (arquivo) => ({
        nomeOriginal: arquivo.name,
        conteudo: await paraBase64(arquivo),
      })),
    );

    const { data } = await api.post('/suporte/anexos', { arquivos: payload });

    for (const falha of data.falharam || []) {
      toast.error(`${falha.nomeOriginal}: ${falha.erro}`);
    }

    return {
      caminhos: (data.enviados || []).map((a) => a.storagePath),
      falharam: data.falharam || [],
    };
  }, []);

  const abrir = useCallback(async ({ assunto, categoria, texto, arquivos }) => {
    const { caminhos } = await subirAnexos(arquivos);

    const { data } = await api.post('/suporte/chamados', {
      assunto,
      categoria,
      texto,
      ...(caminhos.length ? { anexos: caminhos } : {}),
    });

    toast.success(`Chamado #${data.numero} aberto.`);
    return data;
  }, [subirAnexos]);

  const responder = useCallback(async (numero, { texto, arquivos }) => {
    const { caminhos } = await subirAnexos(arquivos);

    const { data } = await api.post(`/suporte/chamados/${numero}/mensagens`, {
      texto,
      ...(caminhos.length ? { anexos: caminhos } : {}),
    });

    // Fora da janela de 30 dias a resposta abre um chamado NOVO. Dizer isso é
    // obrigação: senão a pessoa fica esperando resposta num chamado que ela
    // acha que reabriu.
    if (data.chamadoNovo) {
      toast.success(`Como o chamado #${data.reaberturaDe} já estava fechado há mais de 30 dias, abri o #${data.numero}.`);
    }

    return data;
  }, [subirAnexos]);

  /**
   * Baixa o anexo pela API, autenticado.
   *
   * Não existe URL pública nem link assinado: o arquivo vem pelo mesmo Bearer
   * de todas as chamadas, e vira um blob local só para o navegador exibir.
   */
  const baixarAnexo = useCallback(async (numero, anexo) => {
    const resposta = await api.get(`/suporte/chamados/${numero}/anexos/${anexo.id}`, {
      responseType: 'blob',
    });

    const url = URL.createObjectURL(resposta.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = anexo.nomeOriginal || 'anexo';
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    chamados, carregando, listar, buscar, abrir, responder, baixarAnexo, subirAnexos,
  };
}

/**
 * O arquivo passa? Devolve a mensagem do problema, ou null.
 *
 * Conferido aqui só para a pessoa saber na hora de escolher, sem esperar o
 * upload. Quem decide de verdade é o backend, que olha os bytes do arquivo e
 * não a extensão — um `.png` com outra coisa dentro passa por esta checagem e
 * é recusado lá.
 */
export function problemaNoArquivo(arquivo) {
  if (arquivo.size > LIMITE_BYTES) return 'passa de 5 MB';
  if (!TIPOS_ACEITOS.includes(arquivo.type)) return 'não é PNG, JPG nem PDF';
  return null;
}
