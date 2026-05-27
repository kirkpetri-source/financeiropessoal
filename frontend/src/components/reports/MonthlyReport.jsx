import { useState, useEffect } from 'react';
import { X, Printer, TrendingUp, TrendingDown, DollarSign, Percent, FileText } from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, formatDate, formatMonth, capitalizeFirst } from '../../utils/formatters';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import './MonthlyReport.css';

/* ── Constants ── */
const CHART_COLORS = ['#2563eb','#dc2626','#16a34a','#9333ea','#ea580c','#0891b2','#be185d','#ca8a04'];
const PAYER_COLORS = { Kirk: '#2563eb', Raquel: '#db2777' };
const MAX_TRANSACTIONS = 22;
const MAX_CATEGORIES   = 12;
const ORIGIN_LABELS    = { MANUAL:'✏️ Manual', WHATSAPP:'💬 WhatsApp', AI:'🤖 IA', AUDIO:'🎙️ Áudio', IMAGE:'🖼️ Imagem' };

function payerColor(name) {
  if (PAYER_COLORS[name]) return PAYER_COLORS[name];
  const idx = Object.values(PAYER_COLORS).length;
  return CHART_COLORS[idx % CHART_COLORS.length];
}

function pct(part, total) {
  if (!total) return 0;
  return Math.min(100, (part / total) * 100);
}

/* ── Custom bar label ── */
function BarLabel({ x, y, width, value }) {
  if (!value) return null;
  return (
    <text x={x + width + 4} y={y + 9} fontSize={9} fill="#64748b" dominantBaseline="middle">
      {formatCurrency(value)}
    </text>
  );
}

export default function MonthlyReport({ isOpen, onClose, summary, month }) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.get('/transactions', { params: { month } })
      .then(({ data }) => setTransactions(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, month]);

  if (!isOpen || !summary) return null;

  /* ── Derived data ── */
  const generatedAt  = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  const monthLabel   = capitalizeFirst(formatMonth(month));
  const expenseTotal = summary.totalExpense || 0;
  const expensePct   = summary.totalIncome > 0
    ? ((expenseTotal / summary.totalIncome) * 100).toFixed(1) : '0.0';

  const expenses = transactions.filter(t => t.type === 'EXPENSE');
  const incomes  = transactions.filter(t => t.type === 'INCOME');

  // Category breakdown
  const catMap = {};
  expenses.forEach(t => {
    const name  = t.category?.name  || 'Outros';
    const color = t.category?.color || '#94a3b8';
    if (!catMap[name]) catMap[name] = { name, color, value: 0, count: 0 };
    catMap[name].value += Number(t.amount);
    catMap[name].count++;
  });
  const categoryList = Object.values(catMap).sort((a, b) => b.value - a.value);
  const top5         = categoryList.slice(0, 5);
  const displayedCategories = categoryList.slice(0, MAX_CATEGORIES);

  // Payers
  const payers = (summary.byPayer || []).filter(p =>
    p.name !== 'Sem identificação' && (p.expense > 0 || p.income > 0)
  );
  const totalPayerExpense = payers.reduce((s, p) => s + (p.expense || 0), 0) || expenseTotal || 1;

  // Sorted transactions (most recent first → displayed oldest first for readability)
  const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const displayedTx  = sortedTransactions.slice(-MAX_TRANSACTIONS);
  const hiddenCount  = Math.max(0, transactions.length - MAX_TRANSACTIONS);

  return (
    <div className="rpt-overlay" role="dialog" aria-modal="true">

      {/* ── Controls (hidden on print) ── */}
      <div className="rpt-controls no-print">
        <div className="rpt-controls__left">
          <div className="rpt-controls__icon"><FileText size={17} /></div>
          <div>
            <p className="rpt-controls__name">Relatório Mensal</p>
            <p className="rpt-controls__sub">{monthLabel}</p>
          </div>
        </div>
        <div className="rpt-controls__right">
          <button className="rpt-btn-print" onClick={() => window.print()}>
            <Printer size={14} /> Salvar PDF
          </button>
          <button className="rpt-btn-close" onClick={onClose} aria-label="Fechar">
            <X size={17} />
          </button>
        </div>
      </div>

      {/* ── Scroll area ── */}
      <div className="rpt-scroll">
        {loading ? (
          <div className="rpt-loading">
            <div className="rpt-spinner" />
            <span>Carregando dados…</span>
          </div>
        ) : (
          <div className="rpt-pages">

            {/* ══════════════════════════════════════════
                PÁGINA 1 · Resumo + Pessoas + Gráficos
            ══════════════════════════════════════════ */}
            <div className="rpt-page">

              {/* A · Cabeçalho */}
              <header className="rpt-header">
                <div className="rpt-header__brand">
                  <div className="rpt-logo"><TrendingUp size={17} /></div>
                  <div>
                    <h1 className="rpt-title">Controle Financeiro Pessoal</h1>
                    <p className="rpt-subtitle">Relatório Mensal · {monthLabel}</p>
                  </div>
                </div>
                <div className="rpt-header__meta">
                  <div className="rpt-meta-row"><span className="rpt-ml">Período</span><span className="rpt-mv">{monthLabel}</span></div>
                  <div className="rpt-meta-row"><span className="rpt-ml">Gerado em</span><span className="rpt-mv">{generatedAt}</span></div>
                  <div className="rpt-meta-row"><span className="rpt-ml">Usuário</span><span className="rpt-mv">{user?.name || user?.email || '—'}</span></div>
                </div>
              </header>
              <div className="rpt-rule" />

              {/* B · Cards de resumo */}
              <section className="rpt-section">
                <h2 className="rpt-stitle">Resumo Executivo</h2>
                <div className="summary-grid">

                  <div className="scard scard--income">
                    <div className="scard__ico scard__ico--income"><TrendingUp size={15} /></div>
                    <div>
                      <p className="scard__lbl">Receitas</p>
                      <p className="scard__val income-c">{formatCurrency(summary.totalIncome)}</p>
                      <p className="scard__sub">{incomes.length} lançamento{incomes.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>

                  <div className="scard scard--expense">
                    <div className="scard__ico scard__ico--expense"><TrendingDown size={15} /></div>
                    <div>
                      <p className="scard__lbl">Despesas</p>
                      <p className="scard__val expense-c">{formatCurrency(expenseTotal)}</p>
                      <p className="scard__sub">{expenses.length} lançamento{expenses.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>

                  <div className="scard scard--balance">
                    <div className="scard__ico scard__ico--balance"><DollarSign size={15} /></div>
                    <div>
                      <p className="scard__lbl">Saldo</p>
                      <p className={`scard__val ${summary.balance >= 0 ? 'income-c' : 'expense-c'}`}>
                        {formatCurrency(summary.balance)}
                      </p>
                      <p className="scard__sub">{summary.balance >= 0 ? '▲ Superávit' : '▼ Déficit'}</p>
                    </div>
                  </div>

                  <div className="scard scard--pct">
                    <div className="scard__ico scard__ico--pct"><Percent size={15} /></div>
                    <div>
                      <p className="scard__lbl">Comprometido</p>
                      <p className="scard__val pct-c">{expensePct}%</p>
                      {summary.topCategory && <p className="scard__sub">↑ {summary.topCategory.name}</p>}
                    </div>
                  </div>

                </div>
              </section>

              {/* C · Gastos por pessoa */}
              {payers.length > 0 && (
                <section className="rpt-section">
                  <h2 className="rpt-stitle">Gastos por Pessoa</h2>

                  <div className="payers-grid">
                    {payers.map(p => {
                      const color = payerColor(p.name);
                      const share = pct(p.expense, totalPayerExpense);
                      const initial = p.name.charAt(0).toUpperCase();
                      return (
                        <div key={p.name} className="payer-card" style={{ '--payer-color': color }}>
                          <div className="payer-card__left">
                            <div className="payer-avatar" style={{ background: color }}>{initial}</div>
                            <div>
                              <p className="payer-name">{p.name}</p>
                              <p className="payer-share">{share.toFixed(1)}% dos gastos</p>
                            </div>
                          </div>
                          <div className="payer-card__right">
                            <p className="payer-val" style={{ color }}>{formatCurrency(p.expense)}</p>
                            {p.income > 0 && <p className="payer-income income-c">+{formatCurrency(p.income)}</p>}
                          </div>
                          <div className="payer-bar-track">
                            <div className="payer-bar-fill" style={{ width: `${share}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Barra proporcional combinada */}
                  {payers.length > 1 && (
                    <div className="combined-bar">
                      {payers.map(p => {
                        const share = pct(p.expense, totalPayerExpense);
                        return (
                          <div
                            key={p.name}
                            className="combined-bar__seg"
                            style={{ width: `${share}%`, background: payerColor(p.name) }}
                            title={`${p.name}: ${share.toFixed(1)}%`}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* D · Gráficos */}
              <section className="rpt-section">
                <h2 className="rpt-stitle">Análise de Despesas por Categoria</h2>
                <div className="charts-grid">

                  {/* D1 · Maiores gastos — Donut */}
                  <div className="chart-card">
                    <p className="chart-card__title">
                      <span className="chart-dot" style={{ background: '#dc2626' }} />
                      Maiores Gastos
                    </p>
                    {top5.length > 0 ? (
                      <>
                        <div className="chart-wrap">
                          <ResponsiveContainer width="100%" height={160}>
                            <PieChart>
                              <Pie data={top5} cx="50%" cy="50%" innerRadius={42} outerRadius={72}
                                paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                                {top5.map((e, i) => (
                                  <Cell key={e.name} fill={e.color || CHART_COLORS[i % CHART_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={v => [formatCurrency(v), 'Valor']}
                                contentStyle={{ fontSize: 10, borderRadius: 6, padding: '4px 8px' }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="chart-legend">
                          {top5.map((c, i) => (
                            <div key={c.name} className="legend-row">
                              <span className="legend-dot" style={{ background: c.color || CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span className="legend-name">{c.name}</span>
                              <span className="legend-val expense-c">{formatCurrency(c.value)}</span>
                              <span className="legend-pct">{expenseTotal > 0 ? ((c.value / expenseTotal) * 100).toFixed(1) : 0}%</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : <div className="chart-empty">Nenhuma despesa.</div>}
                  </div>

                  {/* D2 · Top categorias — Barras horizontais */}
                  <div className="chart-card">
                    <p className="chart-card__title">
                      <span className="chart-dot" style={{ background: '#2563eb' }} />
                      Top Categorias
                    </p>
                    {top5.length > 0 ? (
                      <>
                        <div className="chart-wrap">
                          <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={top5} layout="vertical"
                              margin={{ top: 2, right: 64, left: 4, bottom: 2 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                              <XAxis type="number" hide />
                              <YAxis type="category" dataKey="name"
                                tick={{ fontSize: 9, fill: '#64748b' }} width={68}
                                axisLine={false} tickLine={false} />
                              <Tooltip formatter={v => [formatCurrency(v), 'Valor']}
                                contentStyle={{ fontSize: 10, borderRadius: 6, padding: '4px 8px' }} />
                              <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={16}>
                                {top5.map((e, i) => (
                                  <Cell key={e.name} fill={e.color || CHART_COLORS[i % CHART_COLORS.length]} />
                                ))}
                                <BarLabel />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="chart-legend">
                          {top5.map((c, i) => (
                            <div key={c.name} className="legend-row">
                              <span className="legend-dot" style={{ background: c.color || CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span className="legend-name">{c.name}</span>
                              <span className="legend-val expense-c">{formatCurrency(c.value)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : <div className="chart-empty">Nenhuma despesa.</div>}
                  </div>

                </div>
              </section>

              <div className="rpt-pagefooter">Página 1 de 2 · {monthLabel} · Controle Financeiro Pessoal</div>
            </div>{/* /page 1 */}


            {/* ══════════════════════════════════════════
                PÁGINA 2 · Tabelas
            ══════════════════════════════════════════ */}
            <div className="rpt-page">

              {/* E · Categorias */}
              <section className="rpt-section">
                <h2 className="rpt-stitle">Despesas por Categoria</h2>
                {displayedCategories.length > 0 ? (
                  <table className="rpt-table">
                    <thead>
                      <tr>
                        <th>Categoria</th>
                        <th className="tc">Qtd</th>
                        <th className="tr">Valor</th>
                        <th className="tr" style={{ width: 90 }}>% / Barra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedCategories.map((cat, i) => {
                        const share = expenseTotal > 0 ? (cat.value / expenseTotal) * 100 : 0;
                        return (
                          <tr key={cat.name} className={i % 2 === 0 ? 'tr-even' : 'tr-odd'}>
                            <td>
                              <span className="cat-dot" style={{ background: cat.color }} />
                              {cat.name}
                            </td>
                            <td className="tc">{cat.count}</td>
                            <td className="tr fw6 expense-c">{formatCurrency(cat.value)}</td>
                            <td className="tr">
                              <div className="pct-cell">
                                <span className="pct-num">{share.toFixed(1)}%</span>
                                <div className="pct-track">
                                  <div className="pct-fill" style={{ width: `${share}%`, background: cat.color }} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="tr-total">
                        <td className="fw7">Total</td>
                        <td className="tc fw7">{expenses.length}</td>
                        <td className="tr fw7 expense-c">{formatCurrency(expenseTotal)}</td>
                        <td className="tr fw7">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  <p className="tbl-empty">Nenhuma despesa registrada neste mês.</p>
                )}
              </section>

              {/* F · Todos os lançamentos */}
              <section className="rpt-section rpt-section--mt">
                <h2 className="rpt-stitle">
                  Lançamentos do Mês
                  {hiddenCount > 0 && <span className="stitle-note"> — exibindo os {MAX_TRANSACTIONS} mais recentes de {transactions.length}</span>}
                </h2>
                {displayedTx.length > 0 ? (
                  <table className="rpt-table rpt-table--xs">
                    <thead>
                      <tr>
                        <th style={{ width: 64 }}>Data</th>
                        <th>Descrição</th>
                        <th>Categoria</th>
                        <th>Pagamento</th>
                        {payers.length > 0 && <th>Pessoa</th>}
                        <th>Origem</th>
                        <th className="tr">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedTx.map((t, i) => (
                        <tr key={t.id} className={i % 2 === 0 ? 'tr-even' : 'tr-odd'}>
                          <td className="tnw">{formatDate(t.date)}</td>
                          <td>{t.description}</td>
                          <td>
                            {t.category?.color && <span className="cat-dot" style={{ background: t.category.color }} />}
                            {t.category?.name || '—'}
                          </td>
                          <td>{t.paymentMethod?.name || '—'}</td>
                          {payers.length > 0 && (
                            <td>
                              {t.paidBy ? (
                                <span className="payer-badge" style={{ background: `${payerColor(t.paidBy)}18`, color: payerColor(t.paidBy) }}>
                                  {t.paidBy}
                                </span>
                              ) : '—'}
                            </td>
                          )}
                          <td className="tnw">{ORIGIN_LABELS[t.origin] || t.origin || '—'}</td>
                          <td className={`tr fw6 tnw ${t.type === 'INCOME' ? 'income-c' : 'expense-c'}`}>
                            {t.type === 'INCOME' ? '+' : '−'}{formatCurrency(t.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="tr-sub">
                        <td colSpan={payers.length > 0 ? 6 : 5} className="fw6">Receitas do mês</td>
                        <td className="tr fw7 income-c">+{formatCurrency(summary.totalIncome)}</td>
                      </tr>
                      <tr className="tr-sub">
                        <td colSpan={payers.length > 0 ? 6 : 5} className="fw6">Despesas do mês</td>
                        <td className="tr fw7 expense-c">−{formatCurrency(expenseTotal)}</td>
                      </tr>
                      <tr className="tr-total tr-balance">
                        <td colSpan={payers.length > 0 ? 6 : 5} className="fw7">Saldo Final</td>
                        <td className={`tr fw7 ${summary.balance >= 0 ? 'income-c' : 'expense-c'}`}>
                          {formatCurrency(summary.balance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  <p className="tbl-empty">Nenhum lançamento registrado neste mês.</p>
                )}
              </section>

              {/* G · Footer */}
              <footer className="rpt-footer">
                Gerado em {generatedAt} &bull; Controle Financeiro Pessoal &bull; Página 2 de 2
              </footer>

            </div>{/* /page 2 */}

          </div>
        )}
      </div>
    </div>
  );
}
