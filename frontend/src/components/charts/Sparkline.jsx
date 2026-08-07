import { AreaChart, Area, ResponsiveContainer } from 'recharts';

/**
 * Mini-gráfico de tendência (últimos N meses) para os cards de KPI do
 * Dashboard. Sem eixos, sem grid, sem tooltip — só a forma da curva.
 */
export default function Sparkline({ data, dataKey, color, height = 32 }) {
  if (!data || data.length < 2) return null;
  return (
    <div style={{ width: '100%', height, marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${dataKey}-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#spark-${dataKey}-${color.replace('#', '')})`}
            isAnimationActive
            animationDuration={600}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
