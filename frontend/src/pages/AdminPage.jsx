import { useState, useEffect } from 'react';
import { Loader2, Lock, RefreshCw } from 'lucide-react';
import api from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';

/**
 * Painel de operação do SaaS — MRR, churn e a fila de famílias que precisam de
 * atenção. É a única tela do sistema que olha várias famílias ao mesmo tempo,
 * e por isso vive atrás de um 403 do backend, não de um `if` aqui: esconder o
 * botão não é controle de acesso.
 */

function Numero({ rotulo, valor, detalhe, destaque }) {
  return (
    <div className={`card ${destaque ? 'ring-1 ring-primary-200' : ''}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{rotulo}</p>
      <p className={`mt-1 font-bold ${destaque ? 'text-2xl text-primary-700' : 'text-xl text-gray-900'}`}>
        {valor}
      </p>
      {detalhe && <p className="text-xs text-gray-400 mt-0.5">{detalhe}</p>}
    </div>
  );
}

const CORES_DO_STATUS = {
  active: 'bg-green-100 text-green-800',
  trialing: 'bg-blue-100 text-blue-800',
  past_due: 'bg-red-100 text-red-800',
  pending: 'bg-amber-100 text-amber-800',
  canceled: 'bg-gray-100 text-gray-600',
  paused: 'bg-gray-100 text-gray-600',
};

function percentual(fracao) {
  return `${((fracao || 0) * 100).toFixed(1)}%`;
}

export default function AdminPage() {
  const [metricas, setMetricas] = useState(null);
  const [familias, setFamilias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [semAcesso, setSemAcesso] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const [m, f] = await Promise.all([
        api.get('/admin/metricas'),
        api.get('/admin/familias'),
      ]);
      setMetricas(m.data);
      setFamilias(f.data.familias || []);
      setSemAcesso(false);
    } catch (err) {
      if (err.response?.status === 403) setSemAcesso(true);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  if (carregando && !metricas) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (semAcesso) {
    return (
      <div className="card max-w-md mx-auto text-center space-y-2">
        <Lock className="w-6 h-6 text-gray-400 mx-auto" />
        <p className="text-sm font-medium text-gray-900">Acesso restrito</p>
        <p className="text-xs text-gray-500">
          Este painel é da operação do serviço. Configure ADMIN_EMAILS no backend
          para liberar o seu e-mail.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Operação</h1>
          <p className="text-sm text-gray-500">Janela de {metricas?.janelaDias} dias</p>
        </div>
        <button type="button" onClick={carregar} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero
          rotulo="MRR"
          valor={formatCurrency(metricas?.mrr)}
          detalhe={`ARR ${formatCurrency(metricas?.arr)}`}
          destaque
        />
        <Numero
          rotulo="Pagantes"
          valor={metricas?.pagantes ?? 0}
          detalhe={`ticket ${formatCurrency((metricas?.ticketMedioCentavos || 0) / 100)}`}
        />
        <Numero
          rotulo="Churn"
          valor={percentual(metricas?.churnMensal)}
          detalhe={`${metricas?.canceladasNaJanela ?? 0} cancelamento(s)`}
        />
        <Numero
          rotulo="Conversão de trial"
          valor={percentual(metricas?.conversaoDeTrial)}
          detalhe={`${metricas?.ativadasNaJanela ?? 0} ativação(ões) na janela`}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero rotulo="Famílias" valor={metricas?.total ?? 0} detalhe={`${metricas?.novasNaJanela ?? 0} nova(s)`} />
        <Numero rotulo="Ativas hoje" valor={metricas?.ativas ?? 0} detalhe={`${metricas?.emTrial ?? 0} em teste`} />
        <Numero
          rotulo="Precisam de contato"
          valor={(metricas?.atrasadas ?? 0) + (metricas?.emCarencia ?? 0) + (metricas?.trialVencido ?? 0)}
          detalhe={`${metricas?.emCarencia ?? 0} em carência · ${metricas?.trialVencido ?? 0} trial vencido`}
        />
        <Numero
          rotulo="Exclusões pendentes"
          valor={metricas?.aguardandoExclusao ?? 0}
          detalhe={`${metricas?.canceladas ?? 0} cancelada(s)`}
        />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Famílias ({familias.length}) — ordenadas por quem vence primeiro
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Família</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Vence</th>
                <th className="text-right px-4 py-2 font-medium">Dias</th>
                <th className="text-right px-4 py-2 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {familias.map((f) => (
                <tr key={f.id} className="table-row">
                  <td className="px-4 py-2.5">
                    <p className="text-gray-900">{f.nome || '(sem nome)'}</p>
                    <p className="text-xs text-gray-400">
                      desde {formatDate(f.criadaEm)}
                      {f.exclusaoAgendadaPara && (
                        <span className="text-red-500"> · exclusão em {formatDate(f.exclusaoAgendadaPara)}</span>
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CORES_DO_STATUS[f.status] || 'bg-gray-100 text-gray-600'}`}>
                      {f.status || 'sem assinatura'}
                    </span>
                    {f.emCarencia && <span className="ml-1 text-xs text-red-600">carência</span>}
                    {!f.podeLancar && <span className="ml-1 text-xs text-red-600">bloqueada</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{f.expiraEm ? formatDate(f.expiraEm) : '-'}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{f.diasRestantes ?? '-'}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">
                    {f.precoCentavos != null ? formatCurrency(f.precoCentavos / 100) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
