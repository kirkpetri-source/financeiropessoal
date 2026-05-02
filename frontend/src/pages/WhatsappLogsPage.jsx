import { useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, CheckCircle2, AlertCircle, Clock, XCircle } from 'lucide-react';
import api from '../services/api';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatDateTime, formatCurrency } from '../utils/formatters';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  PROCESSED: { label: 'Processado', icon: CheckCircle2, cls: 'text-green-600 bg-green-50' },
  PENDING: { label: 'Pendente', icon: Clock, cls: 'text-yellow-600 bg-yellow-50' },
  ERROR: { label: 'Erro', icon: AlertCircle, cls: 'text-red-600 bg-red-50' },
  IGNORED: { label: 'Ignorado', icon: XCircle, cls: 'text-gray-400 bg-gray-50' },
};

const TYPE_LABELS = { TEXT: 'Texto', IMAGE: 'Imagem', AUDIO: 'Áudio', DOCUMENT: 'Documento', STICKER: 'Sticker' };

export default function WhatsappLogsPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => { fetchLogs(); }, [filters]);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">Total de {total} mensagens recebidas</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="input w-auto text-sm"
            value={filters.status}
            onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_CONFIG).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <select
            className="input w-auto text-sm"
            value={filters.messageType}
            onChange={(e) => setFilters(f => ({ ...f, messageType: e.target.value }))}
          >
            <option value="">Todos os tipos</option>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={fetchLogs} className="btn-secondary p-2" title="Atualizar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">Como funciona a integração com WhatsApp?</p>
        <p className="text-blue-600 text-xs">
          Configure a Evolution API nas <strong>Configurações</strong> e aponte o webhook para este servidor.
          Mensagens do grupo configurado serão processadas automaticamente.
          Formato aceito: <code className="bg-blue-100 px-1 rounded">gasto mercado 84,90 pix</code>
        </p>
      </div>

      {/* Lista */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Nenhuma mensagem recebida"
            description="Configure a integração e envie mensagens pelo grupo do WhatsApp."
          />
        ) : (
          <div className="divide-y divide-gray-50">
            {logs.map((log) => {
              const statusCfg = STATUS_CONFIG[log.processingStatus] || STATUS_CONFIG.PENDING;
              const StatusIcon = statusCfg.icon;

              return (
                <div key={log.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${statusCfg.cls}`}>
                      <StatusIcon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-gray-900">{log.sender || 'Desconhecido'}</span>
                        <span className="text-xs text-gray-400">{formatDateTime(log.createdAt)}</span>
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          {TYPE_LABELS[log.messageType] || log.messageType}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusCfg.cls}`}>
                          {statusCfg.label}
                        </span>
                      </div>

                      {log.content && (
                        <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 font-mono mt-1">
                          {log.content}
                        </p>
                      )}

                      {log.errorMessage && (
                        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {log.errorMessage}
                        </p>
                      )}

                      {log.transaction && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Lançamento criado: <strong>{log.transaction.description}</strong> — {formatCurrency(log.transaction.amount)}</span>
                        </div>
                      )}

                      {log.groupId && (
                        <p className="text-xs text-gray-400 mt-1">Grupo: {log.groupId}</p>
                      )}
                    </div>
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
