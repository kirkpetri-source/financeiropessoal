import { useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, CheckCircle2, AlertCircle, Clock, XCircle } from 'lucide-react';
import api from '../services/api';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatDateTime, formatCurrency } from '../utils/formatters';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  PROCESSED: { label: 'Processado', icon: CheckCircle2, cls: 'text-green-600', dot: 'bg-green-500' },
  PENDING:   { label: 'Pendente',   icon: Clock,        cls: 'text-yellow-600', dot: 'bg-yellow-400' },
  ERROR:     { label: 'Erro',       icon: AlertCircle,  cls: 'text-red-500',    dot: 'bg-red-500' },
  IGNORED:   { label: 'Ignorado',   icon: XCircle,      cls: 'text-gray-400',   dot: 'bg-gray-300' },
};

const TYPE_LABELS = { TEXT: 'Texto', IMAGE: 'Imagem', AUDIO: 'Áudio', DOCUMENT: 'Doc', STICKER: 'Sticker' };

export default function WhatsappLogsPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [filters, setFilters] = useState({ status: '', messageType: '', limit: 50 });

  async function fetchLogs() {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      const { data } = await api.get('/whatsapp/logs', { params });
      setLogs(data.logs);
      setTotal(data.total);
    } catch {
      toast.error('Erro ao carregar logs.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setPolling(true);
    try {
      const { data } = await api.post('/whatsapp/poll');
      if (data.processed > 0) {
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
    <div className="space-y-3 max-w-4xl mx-auto">
      {/* Barra de controles */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-400">
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
            description={`Envie no grupo: gasto mercado 84,90 pix`}
          />
        ) : (
          <div className="divide-y divide-gray-50">
            {logs.map((log) => {
              const st = STATUS_CONFIG[log.processingStatus] || STATUS_CONFIG.PENDING;
              const StatusIcon = st.icon;
              return (
                <div key={log.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50">
                  {/* Ícone de status */}
                  <div className="flex-shrink-0 mt-0.5">
                    <StatusIcon className={`w-4 h-4 ${st.cls}`} />
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                      <span className="text-xs font-medium text-gray-800">
                        {log.sender || 'Desconhecido'}
                      </span>
                      <span className="text-xs text-gray-400">{formatDateTime(log.createdAt)}</span>
                      <span className={`text-xs font-medium ${st.cls}`}>{st.label}</span>
                      {log.messageType && log.messageType !== 'TEXT' && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          {TYPE_LABELS[log.messageType] || log.messageType}
                        </span>
                      )}
                    </div>

                    {log.content && (
                      <p className="text-xs text-gray-600 font-mono mt-0.5 truncate max-w-lg">
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
