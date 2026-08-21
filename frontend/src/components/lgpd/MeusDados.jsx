import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Download, Trash2, Loader2, ShieldAlert, Undo2, Paperclip } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatDate } from '../../utils/formatters';

/**
 * LGPD na prática: exportar e excluir.
 *
 * A exclusão pede a palavra EXCLUIR digitada. Não é burocracia: é o histórico
 * financeiro de uma família inteira, e um clique errado num botão vermelho não
 * pode ser suficiente para começar a contagem regressiva.
 */

const PALAVRA_DE_CONFIRMACAO = 'EXCLUIR';

/**
 * Baixa os arquivos anexados aos chamados de suporte, um a um.
 *
 * Eles NÃO vêm dentro do JSON do export: cinco anexos de 5 MB virariam ~33 MB
 * de base64 montados na memória do servidor. E não vêm como link assinado, que
 * venceria dentro do arquivo exportado — link morto num JSON é pior que nenhum
 * link, porque parece que funciona.
 *
 * Então portabilidade de verdade é isto: o navegador percorre a lista e busca
 * cada arquivo pelo mesmo endpoint autenticado que a tela do chamado usa.
 */
function AnexosDosChamados() {
  const [baixando, setBaixando] = useState(false);
  const [quantos, setQuantos] = useState(null);

  useEffect(() => {
    api.get('/suporte/chamados')
      .then(({ data }) => setQuantos(data.length))
      .catch(() => setQuantos(0));
  }, []);

  // Sem chamado nenhum, o bloco não aparece: não faz sentido oferecer o
  // download de uma coisa que não existe.
  if (!quantos) return null;

  async function baixarTudo() {
    setBaixando(true);
    let baixados = 0;

    try {
      const { data: lista } = await api.get('/suporte/chamados');

      for (const resumo of lista) {
        const { data: chamado } = await api.get(`/suporte/chamados/${resumo.numero}`);

        for (const mensagem of chamado.mensagens || []) {
          for (const anexo of mensagem.anexos || []) {
            const resposta = await api.get(
              `/suporte/chamados/${chamado.numero}/anexos/${anexo.id}`,
              { responseType: 'blob' },
            );

            const url = URL.createObjectURL(resposta.data);
            const link = document.createElement('a');
            link.href = url;
            // Prefixado pelo número do chamado: vários "comprovante.pdf" na
            // pasta de downloads sem saber de qual chamado é não ajuda ninguém.
            link.download = `chamado-${chamado.numero}-${anexo.nomeOriginal}`;
            link.click();
            URL.revokeObjectURL(url);
            baixados += 1;
          }
        }
      }

      toast.success(baixados
        ? `${baixados} anexo(s) baixado(s).`
        : 'Seus chamados não têm anexos.');
    } catch {
      toast.error(baixados
        ? `Baixei ${baixados} anexo(s) e falhei no resto. Tente de novo.`
        : 'Não consegui baixar os anexos agora.');
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div>
      <p className="text-sm font-medium text-ink">Baixar anexos dos chamados</p>
      <p className="text-xs text-muted mt-0.5 mb-2">
        Os arquivos que você anexou aos chamados de suporte não cabem dentro do
        JSON. Baixe por aqui enquanto sua conta existir.
      </p>
      <button
        type="button"
        onClick={baixarTudo}
        disabled={baixando}
        className="btn-secondary text-sm flex items-center gap-2"
      >
        {baixando
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Baixando...</>
          : <><Paperclip className="w-4 h-4" /> Baixar anexos</>}
      </button>
    </div>
  );
}

export default function MeusDados({ podeExcluir }) {
  const [exportando, setExportando] = useState(false);
  const [pedido, setPedido] = useState(null);
  const [abrindoExclusao, setAbrindoExclusao] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');
  const [motivo, setMotivo] = useState('');
  const [processando, setProcessando] = useState(false);

  const buscarPedido = useCallback(() => {
    api.get('/lgpd/exclusao').then(({ data }) => setPedido(data)).catch(() => {});
  }, []);

  useEffect(buscarPedido, [buscarPedido]);

  async function exportar() {
    setExportando(true);
    try {
      // responseType blob: o backend manda como anexo e o arquivo pode ser
      // grande; deixar o axios tentar interpretar como JSON só gastaria memória.
      const resposta = await api.get('/lgpd/exportar', { responseType: 'blob' });

      const url = URL.createObjectURL(new Blob([resposta.data], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `financeiro-familiar-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('Arquivo baixado.');
    } catch {
      toast.error('Não foi possível gerar a exportação agora.');
    } finally {
      setExportando(false);
    }
  }

  async function pedirExclusao() {
    setProcessando(true);
    try {
      const { data } = await api.post('/lgpd/exclusao', {
        confirmacao: PALAVRA_DE_CONFIRMACAO,
        motivo: motivo || null,
      });
      toast.success(`Exclusão agendada para ${formatDate(data.agendadaPara)}.`);
      setAbrindoExclusao(false);
      setConfirmacao('');
      setMotivo('');
      buscarPedido();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao solicitar exclusão.');
    } finally {
      setProcessando(false);
    }
  }

  async function desistir() {
    setProcessando(true);
    try {
      await api.delete('/lgpd/exclusao');
      toast.success('Exclusão cancelada. Sua conta continua ativa.');
      buscarPedido();
    } catch {
      toast.error('Erro ao cancelar a exclusão.');
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-ink">Exportar meus dados</p>
        <p className="text-xs text-muted mt-0.5 mb-2">
          Baixa todos os lançamentos, membros, categorias, mensagens e chamados de
          suporte da sua família em um arquivo JSON. Continua disponível mesmo com
          a assinatura vencida.
        </p>
        <button
          type="button"
          onClick={exportar}
          disabled={exportando}
          className="btn-secondary text-sm flex items-center gap-2"
        >
          {exportando
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
            : <><Download className="w-4 h-4" /> Baixar arquivo</>}
        </button>
      </div>

      <AnexosDosChamados />

      <div className="pt-4 border-t border-border">
        {pedido?.solicitada ? (
          <div className="space-y-3">
            <div className="flex gap-2 text-sm text-red-900 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Exclusão agendada para {formatDate(pedido.agendadaPara)}.</p>
                <p className="text-xs mt-0.5">
                  A conta está congelada: novos lançamentos estão bloqueados, mas você
                  ainda pode exportar tudo. Depois dessa data, os dados são apagados
                  em definitivo e não há como recuperar.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={desistir}
              disabled={processando}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
              Cancelar a exclusão
            </button>
          </div>
        ) : !podeExcluir ? (
          <p className="text-xs text-muted">
            Só quem é dono da família pode excluir a conta — é o histórico de todos
            que seria apagado. Para sair sozinho, peça ao dono para remover você
            dos membros.
          </p>
        ) : !abrindoExclusao ? (
          <>
            <p className="text-sm font-medium text-ink">Excluir minha conta</p>
            <p className="text-xs text-muted mt-0.5 mb-2">
              Apaga a família, os lançamentos, os membros e as mensagens. Você tem
              7 dias para desistir antes de virar definitivo.
            </p>
            <button
              type="button"
              onClick={() => setAbrindoExclusao(true)}
              className="btn-secondary text-sm text-red-600 border-red-200 hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Excluir conta e dados
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              Exporte seus dados antes, se ainda não exportou. Depois do prazo de
              7 dias não há como recuperar nada.
            </p>
            <div>
              <label className="label">Por quê? (opcional)</label>
              <input
                className="input"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ajuda a melhorar o produto"
              />
            </div>
            <div>
              <label className="label">
                Digite <strong>{PALAVRA_DE_CONFIRMACAO}</strong> para confirmar
              </label>
              <input
                className="input"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value.toUpperCase())}
                placeholder={PALAVRA_DE_CONFIRMACAO}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={pedirExclusao}
                disabled={confirmacao !== PALAVRA_DE_CONFIRMACAO || processando}
                className="btn-danger text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Agendar exclusão
              </button>
              <button
                type="button"
                onClick={() => { setAbrindoExclusao(false); setConfirmacao(''); }}
                className="btn-secondary text-sm"
              >
                Voltar
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-faint pt-2 border-t border-border">
        Detalhes em <Link to="/privacidade" className="underline">política de privacidade</Link> e{' '}
        <Link to="/termos" className="underline">termos de uso</Link>.
      </p>
    </div>
  );
}
