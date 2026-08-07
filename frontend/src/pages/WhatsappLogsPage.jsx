import { useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, CheckCircle2, AlertCircle, Clock, XCircle, Send, Trash2 } from 'lucide-react';
import api from '../services/api';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatDateTime, formatCurrency } from '../utils/formatters';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  PROCESSED:  { label: 'Processado', icon: CheckCircle2, cls: 'text-green-600',  dot: 'bg-green-500' },
  PENDING:    { label: 'Pendente',   icon: Clock,        cls: 'text-yellow-600', dot: 'bg-yellow-400' },
  ERROR:      { label: 'Erro',       icon: AlertCircle,  cls: 'text-red-500',    dot: 'bg-red-500' },
  IGNORED:    { label: 'Ignorado',   icon: XCircle,      cls: 'text-faint',   dot: 'bg-border-strong' },
  CANCELLED:  { label: 'Cancelado',  icon: XCircle,      cls: 'text-faint',   dot: 'bg-border-strong' },
  // Confirmação que o próprio sistema mandou de volta pro WhatsApp — não é
  // uma mensagem da família. Existe como registro para a barreira anti-loop
  // (jaProcessada), não como algo a revisar. Escondida da lista por padrão,
  // igual a CANCELLED — sem rótulo próprio antes, caía no fallback PENDING e
  // parecia um segundo lançamento travado ao lado do real.
  BOT:        { label: 'Confirmação enviada', icon: Send, cls: 'text-faint', dot: 'bg-border-strong' },
};

const STATUS_OCULTOS_POR_PADRAO = ['CANCELLED', 'BOT'];

const TYPE_LABELS = { TEXT: 'Texto', IMAGE: 'Imagem', AUDIO: 'Áudio', DOCUMENT: 'Doc', STICKER: 'Sticker' };

export default function WhatsappLogsPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [filters, setFilters] = useState({ status: '', messageType: '', limit: 50 });

  async function fetchLogs() {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      const { data } = await api.get('/whatsapp/logs', { params });
      // Esconde cancelados e confirmações do próprio bot por padrão (a menos
      // que o filtro explícito peça por eles).
      const visible = filters.status
        ? data.logs
        : data.logs.filter(l => !STATUS_OCULTOS_POR_PADRAO.includes(l.processingStatus));
      setLogs(visible);
      setTotal(visible.length);
    } catch {
      toast.error('Erro ao carregar logs.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(logId) {
    if (!confirm('Cancelar este lançamento? O sistema não vai reprocessar esta mensagem.\n\nVocê pode reenviar a mensagem corrigida no grupo.')) return;
    setDeletingId(logId);
    try {
      await api.delete(`/whatsapp/logs/${logId}`);
      toast.success('Lançamento cancelado. Reenvie a mensagem corrigida no grupo.');
      fetchLogs();
    } catch {
      toast.error('Erro ao excluir.');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRefresh() {
    setPolling(true);
    try {
      const { data } = await api.post('/whatsapp/poll');
      if (data.error) {
        toast.error(data.error, { duration: 6000 });
      } else if (data.processed > 0) {
        toast.success(`${data.processed} nova(s) mensagem(ns) processada(s)!`);
      } else {
        toast.success('Nenhuma mensagem nova encontrada.');
      }
    } catch {
      toast.error('Erro ao verificar mensagens.');
    } finally {
      setPolling(false);
      fetchLogs();
    }
  }

  useEffect(() => { fetchLogs(); }, [filters]);

  return (
    <div id="tour-whatsapp-logs" className="space-y-3 max-w-4xl mx-auto">
      {/* Barra de controles */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-faint">
          {total} mensagem(ns) · verificação automática a cada 2 min
        </p>
        <div className="flex items-center gap-2">
          <select
            className="input w-auto text-xs py-1.5"
            value={filters.status}
            onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_CONFIG).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <button
            onClick={handleRefresh}
            disabled={polling || loading}
            className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${polling ? 'animate-spin' : ''}`} />
            {polling ? 'Verificando...' : 'Verificar agora'}
          </button>
        </div>
      </div>

      {/* Lista compacta */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-10"><LoadingSpinner size="lg" /></div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Nenhuma mensagem recebida"
            description="Comece dizendo se gastou ou recebeu. Ex.: gastei 84,90 no mercado"
          />
        ) : (
          <div className="divide-y divide-border">
            {logs.map((log) => {
              const st = STATUS_CONFIG[log.processingStatus] || STATUS_CONFIG.PENDING;
              const StatusIcon = st.icon;
              return (
                <div key={log.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-alt">
                  {/* Ícone de status */}
                  <div className="flex-shrink-0 mt-0.5">
                    <StatusIcon className={`w-4 h-4 ${st.cls}`} />
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                      <span className="text-xs font-medium text-ink">
                        {log.sender || 'Desconhecido'}
                      </span>
                      <span className="text-xs text-faint">{formatDateTime(log.createdAt)}</span>
                      <span className={`text-xs font-medium ${st.cls}`}>{st.label}</span>
                      {log.messageType && log.messageType !== 'TEXT' && (
                        <span className="text-xs bg-surface-alt text-muted px-1.5 py-0.5 rounded">
                          {TYPE_LABELS[log.messageType] || log.messageType}
                        </span>
                      )}
                    </div>

                    {log.content && (
                      <p className="text-xs text-muted font-mono mt-0.5 truncate max-w-lg">
                        {log.content}
                      </p>
                    )}

                    {log.transaction && (
                      <p className="text-xs text-green-700 mt-0.5">
                        ✅ {log.transaction.description} — {formatCurrency(log.transaction.amount)}
                      </p>
                    )}

                    {log.errorMessage && (
                      <p className="text-xs text-red-400 mt-0.5 truncate">{log.errorMessage}</p>
                    )}
                  </div>

                  {/* Botão excluir */}
                  <button
                    onClick={() => handleDelete(log.id)}
                    disabled={deletingId === log.id}
                    className="flex-shrink-0 p-1.5 text-faint hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-0.5"
                    title="Excluir mensagem e lançamento"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
