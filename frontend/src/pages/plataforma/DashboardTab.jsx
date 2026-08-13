import { useState, useEffect } from 'react';
import {
  ComposedChart, AreaChart, Area, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import api from '../../services/api';
import { formatCurrency } from '../../utils/formatters';

/**
 * Visão geral do negócio — os números que decidem se o RevelaCash está indo
 * bem. MRR/crescimento vêm de `GET /plataforma/metricas/serie`, que é uma
 * PROJEÇÃO calculada a partir do estado atual de cada família (o Firestore
 * não guarda snapshot diário de verdade) — ver o comentário de
 * `serieTemporal` no backend. Serve pra ver tendência, não pra fechamento
 * contábil.
 */

function Numero({ rotulo, valor, detalhe, destaque }) {
  return (
    <div className={`card ${destaque ? 'ring-1 ring-brand-200' : ''}`}>
      <p className="text-xs font-medium text-muted uppercase tracking-wide">{rotulo}</p>
      <p className={`mt-1 font-bold ${destaque ? 'text-2xl text-brand-700' : 'text-xl text-ink'}`}>{valor}</p>
      {detalhe && <p className="text-xs text-faint mt-0.5">{detalhe}</p>}
    </div>
  );
}

function percentual(fracao) {
  return `${((fracao || 0) * 100).toFixed(1)}%`;
}

function formatarDataCurta(iso) {
  if (!iso) return '';
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

function TooltipMrr({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-border-strong rounded-xl shadow-lg px-3 py-2 space-y-0.5">
      <p className="text-xs font-medium text-ink">{formatarDataCurta(label)}</p>
      <p className="text-xs text-brand-700">MRR: {formatCurrency(d.mrr)}</p>
      <p className="text-xs text-muted">Pagantes ativos: {d.pagantesAtivos}</p>
    </div>
  );
}

function TooltipCrescimento({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-border-strong rounded-xl shadow-lg px-3 py-2 space-y-0.5">
      <p className="text-xs font-medium text-ink">{formatarDataCurta(label)}</p>
      <p className="text-xs text-accent-600">Total de famílias: {d.totalFamilias}</p>
      <p className="text-xs text-muted">Novas: {d.novasFamilias} · Canceladas: {d.cancelamentos}</p>
    </div>
  );
}

const CORES_FUNIL = {
  trial: '#3b82f6',
  trial_vencido: '#f59e0b',
  pagantes: '#2dbe79',
  carencia: '#f97316',
  atrasadas: '#ef4444',
  cortesias: '#94a3b8',
  canceladas: '#64748b',
};

function Funil({ segmentos }) {
  const linhas = (segmentos || []).filter((s) => s.chave !== 'todas' && s.chave !== 'precisam_contato');
  const maior = Math.max(1, ...linhas.map((s) => s.total));

  return (
    <div className="card space-y-3">
      <p className="text-sm font-semibold text-ink">Funil de famílias</p>
      <div className="space-y-2">
        {linhas.map((s) => (
          <div key={s.chave} className="flex items-center gap-3">
            <span className="text-xs text-muted w-32 shrink-0">{s.rotulo}</span>
            <div className="flex-1 bg-surface-alt rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${(s.total / maior) * 100}%`, backgroundColor: CORES_FUNIL[s.chave] || '#94a3b8' }}
              />
            </div>
            <span className="text-xs font-medium text-ink w-6 text-right">{s.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardTab() {
  const [metricas, setMetricas] = useState(null);
  const [serie, setSerie] = useState([]);
  const [segmentos, setSegmentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [janelaSerie, setJanelaSerie] = useState(90);

  async function carregar(dias = janelaSerie) {
    setCarregando(true);
    try {
      const [m, s, seg] = await Promise.all([
        api.get('/plataforma/metricas'),
        api.get(`/plataforma/metricas/serie?dias=${dias}`),
        api.get('/plataforma/segmentos'),
      ]);
      setMetricas(m.data);
      setSerie(s.data.serie || []);
      setSegmentos(seg.data.segmentos || []);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(janelaSerie); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [janelaSerie]);

  if (carregando && !metricas) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-faint" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero rotulo="MRR" valor={formatCurrency(metricas?.mrr)} detalhe={`ARR ${formatCurrency(metricas?.arr)}`} destaque />
        <Numero
          rotulo="Pagantes"
          valor={metricas?.pagantes ?? 0}
          detalhe={`ticket ${formatCurrency((metricas?.ticketMedioCentavos || 0) / 100)}`}
        />
        <Numero rotulo="Churn" valor={percentual(metricas?.churnMensal)} detalhe={`${metricas?.canceladasNaJanela ?? 0} cancelamento(s)`} />
        <Numero
          rotulo="Conversão de trial"
          valor={percentual(metricas?.conversaoDeTrial)}
          detalhe={`${metricas?.ativadasNaJanela ?? 0} ativação(ões) na janela`}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero rotulo="Famílias" valor={metricas?.total ?? 0} detalhe={`${metricas?.novasNaJanela ?? 0} nova(s) em ${metricas?.janelaDias}d`} />
        <Numero rotulo="Ativas hoje" valor={metricas?.ativas ?? 0} detalhe={`${metricas?.emTrial ?? 0} em teste`} />
        <Numero
          rotulo="Precisam de contato"
          valor={(metricas?.atrasadas ?? 0) + (metricas?.emCarencia ?? 0) + (metricas?.trialVencido ?? 0)}
          detalhe={`${metricas?.emCarencia ?? 0} carência · ${metricas?.trialVencido ?? 0} trial vencido`}
        />
        <Numero rotulo="Exclusões pendentes" valor={metricas?.aguardandoExclusao ?? 0} detalhe={`${metricas?.canceladas ?? 0} cancelada(s)`} />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Tendência</p>
        <div className="flex gap-1">
          {[30, 90, 180].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setJanelaSerie(d)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border ${janelaSerie === d ? 'bg-brand-700 text-white border-brand-700' : 'border-border-strong text-muted hover:bg-surface-alt'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <p className="text-sm font-semibold text-ink mb-1">MRR projetado</p>
          <p className="text-xs text-faint mb-2">Estimado a partir do estado atual das assinaturas — não é um fechamento contábil.</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={serie} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="mrrGradiente" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#512b8d" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#512b8d" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="data" tickFormatter={formatarDataCurta} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={30} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} width={56} />
              <Tooltip content={<TooltipMrr />} />
              <Area type="monotone" dataKey="mrr" stroke="#512b8d" strokeWidth={2} fill="url(#mrrGradiente)" isAnimationActive animationDuration={500} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <p className="text-sm font-semibold text-ink mb-1">Crescimento de famílias</p>
          <p className="text-xs text-faint mb-2">Barras: cadastros do dia. Linha: total acumulado.</p>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={serie} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="data" tickFormatter={formatarDataCurta} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={30} />
              <YAxis yAxisId="linha" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={30} />
              <YAxis yAxisId="barra" orientation="right" hide />
              <Tooltip content={<TooltipCrescimento />} />
              <Bar yAxisId="barra" dataKey="novasFamilias" fill="#cbb9ea" radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Line yAxisId="linha" type="monotone" dataKey="totalFamilias" stroke="#2dbe79" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <Funil segmentos={segmentos} />
    </div>
  );
}
