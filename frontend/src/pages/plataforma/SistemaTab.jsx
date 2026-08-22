import { useCallback, useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Loader2, Cpu, TrendingUp, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import BackupPainel from './BackupPainel';

/**
 * O CUSTO de manter o produto de pé, e as ferramentas de operação.
 *
 * Existe porque o painel só respondia "quanto entra" (MRR, no Dashboard) e
 * nunca "quanto sai". Num SaaS de R$ 24,90 com IA no meio, essa é metade da
 * conta — e até 22/08/2026 o custo de IA vivia só em `console.log`, o que
 * significava não existir para efeito de decisão.
 *
 * A projeção mensal é a média diária do período vezes 30. É o número que
 * responde "isso cabe na mensalidade?" sem fingir precisão que não tem —
 * teto não é consumo (a lição registrada na regra 24 do projeto).
 */

const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
];

function dataCurta(iso) {
  if (!iso) return '';
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

/** Preço da assinatura, para comparar custo com receita por família. */
const MENSALIDADE = 24.9;

export default function SistemaTab() {
  const [dias, setDias] = useState(30);
  const [custos, setCustos] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await api.get('/plataforma/custos/ia', { params: { dias } });
      setCustos(data);
    } catch {
      toast.error('Não consegui carregar os custos.');
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => { carregar(); }, [carregar]);

  if (carregando && !custos) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-faint" /></div>;
  }

  // Do mais antigo para o mais novo: gráfico de tendência lido da esquerda
  // para a direita. A API devolve do mais novo primeiro, que é o certo para
  // lista e o errado para gráfico.
  const serie = [...(custos?.dias || [])].reverse().map((d) => ({
    dia: d.dia,
    custo: Number((d.totalBRL || 0).toFixed(4)),
    chamadas: d.chamadas || 0,
  }));

  const projecao = custos?.projecaoMensalBRL || 0;
  const familiasQuePagam = projecao > 0 ? Math.ceil(projecao / MENSALIDADE) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-ink">Custo e operação</h2>
          <p className="text-sm text-muted mt-0.5">O que o produto gasta para funcionar.</p>
        </div>

        <div className="flex items-center gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              onClick={() => setDias(p.dias)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors
                          ${dias === p.dias
                ? 'border-brand bg-brand-light text-brand-dark font-medium'
                : 'border-border bg-white text-muted hover:text-ink'}`}
            >
              {p.rotulo}
            </button>
          ))}
          <button
            type="button"
            onClick={carregar}
            disabled={carregando}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-alt transition-colors"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Numero
          rotulo={`Gasto em ${dias} dias`}
          valor={formatCurrency(custos?.totalBRL || 0)}
          detalhe={`${custos?.chamadas || 0} chamadas de IA`}
        />
        <Numero
          rotulo="Projeção mensal"
          valor={formatCurrency(projecao)}
          detalhe={familiasQuePagam
            ? `${familiasQuePagam} ${familiasQuePagam === 1 ? 'mensalidade cobre' : 'mensalidades cobrem'}`
            : 'sem consumo no período'}
          destaque
        />
        <Numero
          rotulo="Média por dia"
          valor={formatCurrency(custos?.mediaDiariaBRL || 0)}
          detalhe={`sobre ${custos?.dias?.length || 0} dia(s) com uso`}
        />
        <Numero
          rotulo="Custo por chamada"
          valor={custos?.chamadas
            ? formatCurrency((custos.totalBRL || 0) / custos.chamadas)
            : formatCurrency(0)}
          detalhe="média do período"
        />
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-4 h-4 text-brand-dark" />
          <p className="text-sm font-semibold text-ink">Gasto de IA por dia</p>
        </div>

        {serie.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">
            Nenhum consumo registrado no período.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={serie} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="gradienteCusto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#512b8d" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#512b8d" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ebe8e2" vertical={false} />
              <XAxis dataKey="dia" tickFormatter={dataCurta} tick={{ fontSize: 11, fill: '#6e6a63' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6e6a63' }} axisLine={false} tickLine={false} width={56}
                tickFormatter={(v) => `R$ ${v.toFixed(2)}`} />
              <Tooltip content={<TooltipCusto />} />
              <Area type="monotone" dataKey="custo" stroke="#512b8d" strokeWidth={2} fill="url(#gradienteCusto)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {custos?.familias?.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-brand-dark" />
            <p className="text-sm font-semibold text-ink">Quem mais consome</p>
          </div>
          <p className="text-xs text-muted mb-3">
            Custo de IA por família no período. Consumo muito acima da média costuma ser caso de
            conversa, não de bloqueio.
          </p>

          <ul className="space-y-1.5">
            {custos.familias.map((f) => {
              const acimaDaMensalidade = f.totalBRL > MENSALIDADE;

              return (
                <li key={f.householdId} className="flex items-center gap-3 text-sm py-1.5 border-b border-border last:border-0">
                  <span className="font-mono text-xs text-muted truncate flex-1">{f.householdId}</span>
                  <span className="text-xs text-faint">{f.chamadas} chamadas</span>
                  <span className={`font-medium tabular-nums ${acimaDaMensalidade ? 'text-expense' : 'text-ink'}`}>
                    {formatCurrency(f.totalBRL)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <BackupPainel />
    </div>
  );
}

function Numero({ rotulo, valor, detalhe, destaque }) {
  return (
    <div className={`card ${destaque ? 'ring-1 ring-brand-200' : ''}`}>
      <p className="text-xs font-medium text-muted uppercase tracking-wide">{rotulo}</p>
      <p className={`mt-1 font-bold ${destaque ? 'text-2xl text-brand-700' : 'text-xl text-ink'}`}>{valor}</p>
      {detalhe && <p className="text-xs text-faint mt-0.5">{detalhe}</p>}
    </div>
  );
}

function TooltipCusto({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  return (
    <div className="bg-white border border-border-strong rounded-xl shadow-lg px-3 py-2 space-y-0.5">
      <p className="text-xs font-medium text-ink">{dataCurta(label)}</p>
      <p className="text-xs text-brand-700">{formatCurrency(d.custo)}</p>
      <p className="text-xs text-muted">{d.chamadas} chamadas</p>
    </div>
  );
}
