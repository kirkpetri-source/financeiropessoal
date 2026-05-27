import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, DollarSign, Percent,
  Plus, ArrowRight, FileBarChart, X,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import MonthlyReport from '../components/reports/MonthlyReport';
import { useTransactions } from '../hooks/useTransactions';
import { useCategories } from '../hooks/useCategories';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { useWhatsappConfig } from '../hooks/useWhatsappConfig';
import Modal from '../components/ui/Modal';
import TransactionForm from '../components/forms/TransactionForm';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import {
  formatCurrency, formatDate, currentMonth,
  monthsList, formatMonth, capitalizeFirst,
} from '../utils/formatters';
import toast from 'react-hot-toast';
import './DashboardPage.css';

/* ── Constants ── */
const PERSON_COLORS = { Kirk: '#3b5bdb', Raquel: '#e64980' };
const CHART_COLORS  = ['#3b5bdb','#e64980','#0d9488','#d97706','#7c3aed','#0891b2','#be185d','#059669'];

function personColor(name) {
  if (PERSON_COLORS[name]) return PERSON_COLORS[name];
  return CHART_COLORS[Math.abs((name || '').charCodeAt(0) % CHART_COLORS.length)];
}

/* ── Recharts horizontal-bar value label ── */
function BarValueLabel({ x, y, width, height, value }) {
  if (!value) return null;
  return (
    <text
      x={x + width + 6}
      y={y + (height || 16) / 2}
      fontSize={9.5}
      fill="#a39f98"
      dominantBaseline="middle"
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
    >
      {formatCurrency(value)}
    </text>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth]   = useState(currentMonth());
  const [modalOpen,     setModalOpen]       = useState(false);
  const [reportOpen,    setReportOpen]      = useState(false);
  const [saving,        setSaving]          = useState(false);
  const [filterPayer,   setFilterPayer]     = useState('');

  const { summary, fetchSummary, createTransaction } = useTransactions();
  const { categories,     fetchCategories }     = useCategories();
  const { paymentMethods, fetchPaymentMethods } = usePaymentMethods();
  const { payers: payerConfig, fetchPayers }    = useWhatsappConfig();

  const months = monthsList(12);

  useEffect(() => { fetchSummary(selectedMonth); }, [selectedMonth, fetchSummary]);
  useEffect(() => {
    fetchCategories();
    fetchPaymentMethods();
    fetchPayers();
  }, [fetchCategories, fetchPaymentMethods, fetchPayers]);

  async function handleCreateTransaction(data) {
    setSaving(true);
    try {
      await createTransaction(data);
      setModalOpen(false);
      fetchSummary(selectedMonth);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar lançamento.');
    } finally {
      setSaving(false);
    }
  }

  /* ── Derived data ── */
  const allPayers = summary?.byPayer?.filter(p =>
    p.name !== 'Sem identificação' && (p.expense > 0 || p.income > 0)
  ) || [];

  const filteredSummary = useMemo(() => {
    if (!summary) return null;
    if (!filterPayer) return summary;
    const payer   = summary.byPayer?.find(p => p.name === filterPayer);
    const income  = payer?.income  || 0;
    const expense = payer?.expense || 0;
    return { ...summary, totalIncome: income, totalExpense: expense, balance: income - expense };
  }, [summary, filterPayer]);

  const totalIncome  = filteredSummary?.totalIncome  ?? 0;
  const totalExpense = filteredSummary?.totalExpense ?? 0;
  const balance      = filteredSummary?.balance      ?? 0;
  const expensePct   = totalIncome > 0
    ? Math.min(100, (totalExpense / totalIncome) * 100) : 0;

  const totalPayerExp = allPayers.reduce((s, p) => s + (p.expense || 0), 0) || 1;

  const topCategories = useMemo(
    () => (summary?.expenseByCategory || []).slice(0, 6),
    [summary],
  );
  const barCategories = useMemo(
    () => (summary?.expenseByCategory || []).slice(0, 5),
    [summary],
  );

  /* ── Auto insights ── */
  const insights = useMemo(() => {
    if (!summary) return [];
    const list = [];

    if (balance < 0)
      list.push({ type: 'warning', icon: '⚠️', text: `Déficit de ${formatCurrency(Math.abs(balance))} neste mês` });

    const topCat = summary.expenseByCategory?.[0];
    if (topCat && totalExpense > 0 && topCat.value / totalExpense > 0.35)
      list.push({ type: 'info', icon: '📌', text: `${topCat.name} representa ${((topCat.value / totalExpense) * 100).toFixed(0)}% dos gastos` });

    if (allPayers.length > 1) {
      const topPayer = [...allPayers].sort((a, b) => b.expense - a.expense)[0];
      const share = ((topPayer.expense / totalPayerExp) * 100).toFixed(0);
      if (Number(share) > 60)
        list.push({ type: 'neutral', icon: '👤', text: `${topPayer.name} é responsável por ${share}% dos gastos` });
    }

    if (list.length === 0 && balance > 0)
      list.push({ type: 'success', icon: '✅', text: `Saldo positivo de ${formatCurrency(balance)} — bom trabalho!` });

    return list;
  }, [summary, balance, totalExpense, allPayers, totalPayerExp]);

  /* ── KPI progress bar widths ── */
  const incomeBarW  = 100;
  const expenseBarW = expensePct;
  const balanceBarW = Math.min(100, Math.abs(expensePct));
  const pctBarColor = expensePct > 80 ? '#dc2626' : expensePct > 60 ? '#d97706' : '#7c3aed';

  return (
    <div className="dash-root max-w-7xl mx-auto">

      {/* ══════════════════════════════════
          TOP BAR
      ══════════════════════════════════ */}
      <div className="dash-topbar">
        <div>
          <h1 className="dash-heading">Painel Financeiro</h1>
          <p className="dash-subheading">{capitalizeFirst(formatMonth(selectedMonth))}</p>
        </div>
        <div className="dash-topbar__right">
          <div className="dash-selects">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="dash-select"
            >
              {months.map(m => (
                <option key={m.value} value={m.value}>{capitalizeFirst(m.label)}</option>
              ))}
            </select>
            {allPayers.length > 1 && (
              <select
                value={filterPayer}
                onChange={e => setFilterPayer(e.target.value)}
                className="dash-select"
              >
                <option value="">👥 Todos</option>
                {allPayers.map(p => (
                  <option key={p.name} value={p.name}>👤 {p.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="dash-actions">
            {summary && (
              <button className="dash-btn dash-btn--ghost" onClick={() => setReportOpen(true)}>
                <FileBarChart size={14} />
                <span className="hidden sm:inline">Relatório</span>
              </button>
            )}
            <button className="dash-btn dash-btn--primary" onClick={() => setModalOpen(true)}>
              <Plus size={14} />
              <span>Novo</span>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════
          LOADING
      ══════════════════════════════════ */}
      {!summary ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="dash-content">

          {/* ══════════════════════════════════
              KPI CARDS
          ══════════════════════════════════ */}
          <div className="dash-kpi-grid">

            {/* Receitas */}
            <div className="dash-kpi-card dash-kpi-card--income dash-animate dash-delay-1">
              <div className="dash-kpi-card__top">
                <div className="dash-kpi-icon dash-kpi-icon--income"><TrendingUp size={15} /></div>
                <span className="dash-kpi-label">
                  {filterPayer ? `Receitas · ${filterPayer}` : 'Receitas'}
                </span>
              </div>
              <p className="dash-kpi-value income-text">{formatCurrency(totalIncome)}</p>
              <p className="dash-kpi-sub">Total recebido no mês</p>
              <div className="dash-progress-track">
                <div className="dash-progress-fill" style={{ width: `${incomeBarW}%`, background: '#0d9488' }} />
              </div>
            </div>

            {/* Despesas */}
            <div className="dash-kpi-card dash-kpi-card--expense dash-animate dash-delay-2">
              <div className="dash-kpi-card__top">
                <div className="dash-kpi-icon dash-kpi-icon--expense"><TrendingDown size={15} /></div>
                <span className="dash-kpi-label">
                  {filterPayer ? `Despesas · ${filterPayer}` : 'Despesas'}
                </span>
              </div>
              <p className="dash-kpi-value expense-text">{formatCurrency(totalExpense)}</p>
              <p className="dash-kpi-sub">
                {summary.expenseByCategory?.length || 0} categoria{summary.expenseByCategory?.length !== 1 ? 's' : ''}
              </p>
              <div className="dash-progress-track">
                <div className="dash-progress-fill" style={{ width: `${expenseBarW}%`, background: '#dc2626' }} />
              </div>
            </div>

            {/* Saldo */}
            <div className={`dash-kpi-card dash-animate dash-delay-3 ${balance >= 0 ? 'dash-kpi-card--balance' : 'dash-kpi-card--deficit'}`}>
              <div className="dash-kpi-card__top">
                <div className={`dash-kpi-icon ${balance >= 0 ? 'dash-kpi-icon--balance' : 'dash-kpi-icon--deficit'}`}>
                  <DollarSign size={15} />
                </div>
                <span className="dash-kpi-label">
                  {filterPayer ? `Saldo · ${filterPayer}` : 'Saldo'}
                </span>
              </div>
              <p className={`dash-kpi-value ${balance >= 0 ? 'balance-text' : 'expense-text'}`}>
                {formatCurrency(balance)}
              </p>
              <p className="dash-kpi-sub">{balance >= 0 ? '▲ Superávit' : '▼ Déficit'}</p>
              <div className="dash-progress-track">
                <div className="dash-progress-fill"
                  style={{ width: `${balanceBarW}%`, background: balance >= 0 ? '#2563eb' : '#dc2626' }} />
              </div>
            </div>

            {/* Comprometido */}
            <div className="dash-kpi-card dash-kpi-card--pct dash-animate dash-delay-4">
              <div className="dash-kpi-card__top">
                <div className="dash-kpi-icon dash-kpi-icon--pct"><Percent size={15} /></div>
                <span className="dash-kpi-label">Comprometido</span>
              </div>
              <p className={`dash-kpi-value ${expensePct > 80 ? 'expense-text' : expensePct > 60 ? 'warn-text' : 'pct-text'}`}>
                {expensePct.toFixed(1)}%
              </p>
              <p className="dash-kpi-sub">↑ {summary.topCategory?.name || 'sem categoria'}</p>
              <div className="dash-progress-track">
                <div className="dash-progress-fill" style={{ width: `${expensePct}%`, background: pctBarColor }} />
              </div>
            </div>

          </div>

          {/* ══════════════════════════════════
              GASTOS POR PESSOA
          ══════════════════════════════════ */}
          {allPayers.length > 0 && (
            <div className="dash-section dash-animate dash-delay-5">
              <div className="dash-section-header">
                <h2 className="dash-section-title">Gastos por Pessoa</h2>
                {filterPayer && (
                  <button className="dash-clear-filter" onClick={() => setFilterPayer('')}>
                    <X size={11} /> Limpar filtro
                  </button>
                )}
              </div>

              <div className="dash-payer-grid">
                {allPayers.map(p => {
                  const color    = personColor(p.name);
                  const share    = (p.expense / totalPayerExp) * 100;
                  const isActive = filterPayer === p.name;
                  return (
                    <button
                      key={p.name}
                      className={`dash-payer-card ${isActive ? 'dash-payer-card--active' : ''}`}
                      style={{ '--payer-color': color }}
                      onClick={() => setFilterPayer(isActive ? '' : p.name)}
                    >
                      <div className="dash-payer-card__body">
                        <div className="dash-payer-avatar" style={{ background: color }}>
                          {p.name.charAt(0)}
                        </div>
                        <div className="dash-payer-info">
                          <p className="dash-payer-name">{p.name}</p>
                          <p className="dash-payer-share">{share.toFixed(1)}% dos gastos</p>
                        </div>
                        <div className="dash-payer-amounts">
                          <p className="dash-payer-expense" style={{ color }}>{formatCurrency(p.expense)}</p>
                          {p.income > 0 && (
                            <p className="dash-payer-income income-text">+{formatCurrency(p.income)}</p>
                          )}
                        </div>
                      </div>
                      <div className="dash-progress-track">
                        <div className="dash-progress-fill" style={{ width: `${share}%`, background: color }} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {allPayers.length > 1 && (
                <div className="dash-battle-bar">
                  {allPayers.map(p => {
                    const share = (p.expense / totalPayerExp) * 100;
                    return (
                      <div
                        key={p.name}
                        className="dash-battle-seg"
                        style={{ width: `${share}%`, background: personColor(p.name) }}
                        title={`${p.name}: ${share.toFixed(1)}%`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════
              INSIGHTS
          ══════════════════════════════════ */}
          {insights.length > 0 && (
            <div className="dash-insights dash-animate dash-delay-5">
              {insights.map((ins, i) => (
                <div key={i} className={`dash-insight-pill dash-insight-pill--${ins.type}`}>
                  <span>{ins.icon}</span>
                  <span>{ins.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* ══════════════════════════════════
              CHARTS
          ══════════════════════════════════ */}
          <div className="dash-charts-grid dash-animate dash-delay-5">

            {/* Donut — Despesas por Categoria */}
            <div className="dash-chart-card">
              <p className="dash-chart-title">Despesas por Categoria</p>
              {topCategories.length > 0 ? (
                <div className="dash-donut-wrap">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={topCategories}
                        cx="50%" cy="50%"
                        innerRadius={56} outerRadius={86}
                        paddingAngle={2.5}
                        dataKey="value"
                        startAngle={90} endAngle={-270}
                      >
                        {topCategories.map((e, i) => (
                          <Cell key={e.name} fill={e.color || CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={v => [formatCurrency(v), 'Valor']}
                        contentStyle={{ fontSize: 11, borderRadius: 8, padding: '5px 10px', border: '1px solid #ebe8e2' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="dash-donut-legend">
                    {topCategories.map((c, i) => (
                      <div key={c.name} className="dash-legend-row">
                        <span className="dash-legend-dot" style={{ background: c.color || CHART_COLORS[i] }} />
                        <span className="dash-legend-name">{c.name}</span>
                        <span className="dash-legend-val expense-text">{formatCurrency(c.value)}</span>
                        <span className="dash-legend-pct">
                          {totalExpense > 0 ? ((c.value / totalExpense) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="dash-chart-empty">Nenhuma despesa registrada.</div>
              )}
            </div>

            {/* Horizontal Bar — Top 5 Categorias */}
            <div className="dash-chart-card">
              <p className="dash-chart-title">Top 5 Categorias</p>
              {barCategories.length > 0 ? (
                <ResponsiveContainer width="100%" height={224}>
                  <BarChart
                    data={barCategories}
                    layout="vertical"
                    margin={{ top: 4, right: 78, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f2eeea" />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10, fill: '#a39f98', fontFamily: 'Outfit, sans-serif' }}
                      width={74}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={v => [formatCurrency(v), 'Valor']}
                      contentStyle={{ fontSize: 11, borderRadius: 8, padding: '5px 10px', border: '1px solid #ebe8e2' }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={17}
                         label={<BarValueLabel />}>
                      {barCategories.map((e, i) => (
                        <Cell key={e.name} fill={e.color || CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="dash-chart-empty">Nenhuma despesa registrada.</div>
              )}
            </div>

          </div>

          {/* ══════════════════════════════════
              TRANSAÇÕES RECENTES
          ══════════════════════════════════ */}
          <div className="dash-section dash-animate dash-delay-6">
            <div className="dash-section-header">
              <h2 className="dash-section-title">Transações Recentes</h2>
              <button className="dash-view-all" onClick={() => navigate('/transactions')}>
                Ver todas <ArrowRight size={12} />
              </button>
            </div>

            {summary.recentTransactions.length === 0 ? (
              <div className="dash-empty-state">
                <div className="dash-empty-icon">📭</div>
                <p className="dash-empty-text">Nenhum lançamento registrado neste mês.</p>
                <button className="dash-btn dash-btn--primary dash-btn--sm" onClick={() => setModalOpen(true)}>
                  <Plus size={13} /> Adicionar primeiro
                </button>
              </div>
            ) : (
              <div className="dash-tx-list">
                {summary.recentTransactions.slice(0, 8).map((t, i) => (
                  <div key={t.id} className={`dash-tx-row ${i % 2 === 0 ? 'dash-tx-row--even' : ''}`}>
                    <div className="dash-tx-dot" style={{ background: t.category?.color || '#d1cdc8' }} />
                    <div className="dash-tx-info">
                      <p className="dash-tx-desc">{t.description}</p>
                      <p className="dash-tx-meta">
                        {formatDate(t.date)}
                        {t.category?.name && ` · ${t.category.name}`}
                        {t.paymentMethod?.name && ` · ${t.paymentMethod.name}`}
                      </p>
                    </div>
                    <div className="dash-tx-right">
                      {t.paidBy && (
                        <span
                          className="dash-payer-badge"
                          style={{
                            background: `${personColor(t.paidBy)}18`,
                            color: personColor(t.paidBy),
                          }}
                        >
                          {t.paidBy}
                        </span>
                      )}
                      <span className={`dash-tx-amount ${t.type === 'INCOME' ? 'income-text' : 'expense-text'}`}>
                        {t.type === 'INCOME' ? '+' : '−'}{formatCurrency(t.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── Modals ── */}
      <MonthlyReport
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        summary={summary}
        month={selectedMonth}
      />
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Novo Lançamento">
        <TransactionForm
          categories={categories}
          paymentMethods={paymentMethods}
          payers={payerConfig}
          onSubmit={handleCreateTransaction}
          isLoading={saving}
        />
      </Modal>
    </div>
  );
}
