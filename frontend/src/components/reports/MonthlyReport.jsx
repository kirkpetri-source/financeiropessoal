import { useState, useEffect } from 'react';
import {
  X, Printer, TrendingUp, TrendingDown, DollarSign,
  BarChart2, Percent, FileText
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  formatCurrency, formatDate, formatMonth, capitalizeFirst
} from '../../utils/formatters';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import './MonthlyReport.css';

const CHART_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#9333ea',
  '#ea580c', '#0891b2', '#be185d', '#ca8a04',
];

function currencyCompact(v) {
  if (v >= 1000) return `R$${(v / 1000).toFixed(1)}k`;
  return `R$${Number(v).toFixed(0)}`;
}

const ORIGIN_LABELS = {
  MANUAL:   '✏️ Manual',
  WHATSAPP: '💬 WhatsApp',
  AI:       '🤖 IA',
  AUDIO:    '🎙️ Áudio',
  IMAGE:    '🖼️ Imagem',
};

export default function MonthlyReport({ isOpen, onClose, summary, month }) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api
      .get('/transactions', { params: { month } })
      .then(({ data }) => setTransactions(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, month]);

  if (!isOpen || !summary) return null;

  const generatedAt = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  const monthLabel  = capitalizeFirst(formatMonth(month));

  /* ── Derived data ── */
  const expenses = transactions.filter(t => t.type === 'EXPENSE');
  const incomes  = transactions.filter(t => t.type === 'INCOME');

  const expenseTotal = summary.totalExpense;
  const expensePct = summary.totalIncome > 0
    ? ((summary.totalExpense / summary.totalIncome) * 100).toFixed(1)
    : '0.0';

  // Build category breakdown from full transaction list
  const categoryMap = {};
  expenses.forEach(t => {
    const name  = t.category?.name  || 'Sem categoria';
    const color = t.category?.color || '#94a3b8';
    if (!categoryMap[name]) categoryMap[name] = { name, color, value: 0, count: 0 };
    categoryMap[name].value += Number(t.amount);
    categoryMap[name].count++;
  });
  const categoryList = Object.values(categoryMap).sort((a, b) => b.value - a.value);

  const top5    = categoryList.slice(0, 5);
  const bottom5 = [...categoryList]
    .sort((a, b) => a.value - b.value)
    .slice(0, Math.min(5, categoryList.length));

  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  return (
    <div className="report-overlay" role="dialog" aria-modal="true" aria-label="Relatório Mensal">

      {/* ── Controls Bar (hidden on print) ── */}
      <div className="report-controls no-print">
        <div className="report-controls__info">
          <div className="report-controls__icon">
            <FileText size={18} />
          </div>
          <div>
            <p className="report-controls__title">Relatório Mensal</p>
            <p className="report-controls__subtitle">{monthLabel}</p>
          </div>
        </div>
        <div className="report-controls__actions">
          <button className="report-print-btn" onClick={() => window.print()}>
            <Printer size={15} />
            Salvar PDF
          </button>
          <button className="report-close-btn" onClick={onClose} aria-label="Fechar relatório">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Scrollable preview ── */}
      <div className="report-scroll">
        {loading ? (
          <div className="report-loading">
            <div className="report-spinner" />
            <p>Carregando dados…</p>
          </div>
        ) : (
          <div className="report-pages" id="report-print-root">

            {/* ═══════════════════════════════════════
                PAGE 1 · Header + Summary + Charts
            ═══════════════════════════════════════ */}
            <div className="report-page">

              {/* A · Header */}
              <header className="rpt-header">
                <div className="rpt-header__left">
                  <div className="rpt-logo">
                    <TrendingUp size={18} />
                  </div>
                  <div>
                    <h1 className="rpt-title">Controle Financeiro Pessoal</h1>
                    <p className="rpt-subtitle">Relatório Mensal de Receitas e Despesas</p>
                  </div>
                </div>
                <div className="rpt-header__right">
                  <div className="rpt-meta-row">
                    <span className="rpt-meta-label">Período</span>
                    <span className="rpt-meta-value">{monthLabel}</span>
                  </div>
                  <div className="rpt-meta-row">
                    <span className="rpt-meta-label">Gerado em</span>
                    <span className="rpt-meta-value">{generatedAt}</span>
                  </div>
                  <div className="rpt-meta-row">
                    <span className="rpt-meta-label">Usuário</span>
                    <span className="rpt-meta-value">{user?.name || user?.email || '—'}</span>
                  </div>
                </div>
              </header>

              <div className="rpt-rule" />

              {/* B · Summary Cards */}
              <section className="rpt-section">
                <h2 className="rpt-section-title">Resumo Executivo</h2>
                <div className="summary-grid">

                  <div className="summary-card summary-card--income">
                    <div className="summary-card__icon summary-card__icon--income">
                      <TrendingUp size={16} />
                    </div>
                    <div className="summary-card__body">
                      <p className="summary-card__label">Total de Receitas</p>
                      <p className="summary-card__value income-color">
                        {formatCurrency(summary.totalIncome)}
                      </p>
                      <p className="summary-card__sub">{incomes.length} lançamento{incomes.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>

                  <div className="summary-card summary-card--expense">
                    <div className="summary-card__icon summary-card__icon--expense">
                      <TrendingDown size={16} />
                    </div>
                    <div className="summary-card__body">
                      <p className="summary-card__label">Total de Despesas</p>
                      <p className="summary-card__value expense-color">
                        {formatCurrency(summary.totalExpense)}
                      </p>
                      <p className="summary-card__sub">{expenses.length} lançamento{expenses.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>

                  <div className="summary-card summary-card--balance">
                    <div className="summary-card__icon summary-card__icon--balance">
                      <DollarSign size={16} />
                    </div>
                    <div className="summary-card__body">
                      <p className="summary-card__label">Saldo do Mês</p>
                      <p className={`summary-card__value ${summary.balance >= 0 ? 'income-color' : 'expense-color'}`}>
                        {formatCurrency(summary.balance)}
                      </p>
                      <p className="summary-card__sub">
                        {summary.balance >= 0 ? '▲ Superávit' : '▼ Déficit'}
                      </p>
                    </div>
                  </div>

                  <div className="summary-card summary-card--pct">
                    <div className="summary-card__icon summary-card__icon--pct">
                      <Percent size={16} />
                    </div>
                    <div className="summary-card__body">
                      <p className="summary-card__label">Comprometido</p>
                      <p className="summary-card__value pct-color">{expensePct}%</p>
                      {summary.topCategory && (
                        <p className="summary-card__sub">Top: {summary.topCategory.name}</p>
                      )}
                    </div>
                  </div>

                </div>
              </section>

              {/* C & D · Charts */}
              <section className="rpt-section charts-grid">

                {/* C · Biggest expenses */}
                <div className="chart-card">
                  <h3 className="chart-card__title">
                    <span className="chart-card__dot chart-card__dot--big" />
                    Maiores Gastos por Categoria
                  </h3>
                  {top5.length > 0 ? (
                    <>
                      <div className="chart-area">
                        <ResponsiveContainer width="100%" height={190}>
                          <PieChart>
                            <Pie
                              data={top5}
                              cx="50%"
                              cy="50%"
                              innerRadius={48}
                              outerRadius={80}
                              paddingAngle={3}
                              dataKey="value"
                              startAngle={90}
                              endAngle={-270}
                            >
                              {top5.map((entry, idx) => (
                                <Cell
                                  key={entry.name}
                                  fill={entry.color || CHART_COLORS[idx % CHART_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(v) => [formatCurrency(v), 'Valor']}
                              contentStyle={{ fontSize: 11, borderRadius: 8 }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="chart-legend">
                        {top5.map((cat, idx) => {
                          const pct = expenseTotal > 0
                            ? ((cat.value / expenseTotal) * 100).toFixed(1) : '0.0';
                          return (
                            <div key={cat.name} className="legend-row">
                              <span
                                className="legend-dot"
                                style={{ background: cat.color || CHART_COLORS[idx % CHART_COLORS.length] }}
                              />
                              <span className="legend-name">{cat.name}</span>
                              <span className="legend-value expense-color">{formatCurrency(cat.value)}</span>
                              <span className="legend-pct">{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="chart-empty">Nenhuma despesa no período.</div>
                  )}
                </div>

                {/* D · Smallest expenses */}
                <div className="chart-card">
                  <h3 className="chart-card__title">
                    <span className="chart-card__dot chart-card__dot--small" />
                    Menores Gastos por Categoria
                  </h3>
                  {bottom5.length > 0 ? (
                    <>
                      <div className="chart-area">
                        <ResponsiveContainer width="100%" height={190}>
                          <BarChart
                            data={bottom5}
                            layout="vertical"
                            margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis
                              type="number"
                              tickFormatter={currencyCompact}
                              tick={{ fontSize: 9, fill: '#94a3b8' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              type="category"
                              dataKey="name"
                              tick={{ fontSize: 9, fill: '#64748b' }}
                              width={72}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              formatter={(v) => [formatCurrency(v), 'Valor']}
                              contentStyle={{ fontSize: 11, borderRadius: 8 }}
                            />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
                              {bottom5.map((entry, idx) => (
                                <Cell
                                  key={entry.name}
                                  fill={entry.color || CHART_COLORS[idx % CHART_COLORS.length]}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="chart-legend">
                        {bottom5.map((cat, idx) => (
                          <div key={cat.name} className="legend-row">
                            <span
                              className="legend-dot"
                              style={{ background: cat.color || CHART_COLORS[idx % CHART_COLORS.length] }}
                            />
                            <span className="legend-name">{cat.name}</span>
                            <span className="legend-value expense-color">{formatCurrency(cat.value)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="chart-empty">Nenhuma despesa no período.</div>
                  )}
                </div>

              </section>

              {/* Page 1 footer watermark */}
              <div className="rpt-page-footer">
                Página 1 de 2 · {monthLabel} · Controle Financeiro Pessoal
              </div>

            </div>{/* /page 1 */}


            {/* ═══════════════════════════════════════
                PAGE 2 · Tables
            ═══════════════════════════════════════ */}
            <div className="report-page">

              {/* E · Category table */}
              <section className="rpt-section">
                <h2 className="rpt-section-title">Despesas por Categoria</h2>
                {categoryList.length > 0 ? (
                  <table className="rpt-table">
                    <thead>
                      <tr>
                        <th>Categoria</th>
                        <th className="col-center">Lançamentos</th>
                        <th className="col-right">Valor Total</th>
                        <th className="col-right">% do Total</th>
                        <th className="col-right">Barra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryList.map((cat, i) => {
                        const pct = expenseTotal > 0
                          ? (cat.value / expenseTotal) * 100 : 0;
                        return (
                          <tr key={cat.name} className={i % 2 === 0 ? 'tr-even' : 'tr-odd'}>
                            <td>
                              <div className="cell-category">
                                <span className="cell-cat-dot" style={{ background: cat.color }} />
                                <span>{cat.name}</span>
                              </div>
                            </td>
                            <td className="col-center">{cat.count}</td>
                            <td className="col-right fw-600 expense-color">{formatCurrency(cat.value)}</td>
                            <td className="col-right">{pct.toFixed(1)}%</td>
                            <td className="col-right col-bar">
                              <div className="pct-bar-track">
                                <div
                                  className="pct-bar-fill"
                                  style={{ width: `${Math.min(100, pct)}%`, background: cat.color }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="tr-total">
                        <td className="fw-700">Total</td>
                        <td className="col-center fw-700">{expenses.length}</td>
                        <td className="col-right fw-700 expense-color">{formatCurrency(expenseTotal)}</td>
                        <td className="col-right fw-700">100%</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  <p className="table-empty">Nenhuma despesa registrada neste mês.</p>
                )}
              </section>

              {/* F · All transactions */}
              <section className="rpt-section rpt-section--mt">
                <h2 className="rpt-section-title">Todos os Lançamentos</h2>
                {sortedTransactions.length > 0 ? (
                  <table className="rpt-table rpt-table--sm">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th>Categoria</th>
                        <th>Pagamento</th>
                        <th>Origem</th>
                        <th className="col-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTransactions.map((t, i) => (
                        <tr key={t.id} className={i % 2 === 0 ? 'tr-even' : 'tr-odd'}>
                          <td className="col-nowrap">{formatDate(t.date)}</td>
                          <td>{t.description}</td>
                          <td>
                            <div className="cell-category">
                              {t.category?.color && (
                                <span className="cell-cat-dot" style={{ background: t.category.color }} />
                              )}
                              <span>{t.category?.name || '—'}</span>
                            </div>
                          </td>
                          <td>{t.paymentMethod?.name || '—'}</td>
                          <td className="col-nowrap">
                            <span className="origin-tag">
                              {ORIGIN_LABELS[t.origin] || t.origin || '—'}
                            </span>
                          </td>
                          <td className={`col-right fw-600 col-nowrap ${t.type === 'INCOME' ? 'income-color' : 'expense-color'}`}>
                            {t.type === 'INCOME' ? '+' : '−'}{formatCurrency(t.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="tr-subtotal">
                        <td colSpan={5} className="fw-600">Receitas</td>
                        <td className="col-right fw-700 income-color">+{formatCurrency(summary.totalIncome)}</td>
                      </tr>
                      <tr className="tr-subtotal">
                        <td colSpan={5} className="fw-600">Despesas</td>
                        <td className="col-right fw-700 expense-color">−{formatCurrency(summary.totalExpense)}</td>
                      </tr>
                      <tr className="tr-total tr-balance">
                        <td colSpan={5} className="fw-700">Saldo Final</td>
                        <td className={`col-right fw-700 ${summary.balance >= 0 ? 'income-color' : 'expense-color'}`}>
                          {formatCurrency(summary.balance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  <p className="table-empty">Nenhum lançamento registrado neste mês.</p>
                )}
              </section>

              {/* G · Footer */}
              <footer className="rpt-footer">
                <p>Gerado em {generatedAt} &bull; Controle Financeiro Pessoal &bull; Página 2 de 2</p>
              </footer>

            </div>{/* /page 2 */}

          </div>
        )}
      </div>
    </div>
  );
}
