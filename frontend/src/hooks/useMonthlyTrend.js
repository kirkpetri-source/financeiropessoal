import { useState, useCallback } from 'react';
import api from '../services/api';

// Sem endpoint dedicado de histórico no backend — reaproveita o mesmo
// /transactions/summary de sempre, chamado em paralelo para os últimos N
// meses. Evita criar superfície de API nova sem revisão.
function monthsBack(month, n) {
  const [y, m] = month.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function useMonthlyTrend() {
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchTrend = useCallback(async (month, paidBy = null, count = 6) => {
    setLoading(true);
    try {
      const months = monthsBack(month, count);
      const results = await Promise.all(
        months.map((m) => {
          const params = paidBy ? { month: m, paidBy } : { month: m };
          return api.get('/transactions/summary', { params })
            .then((r) => r.data)
            .catch(() => null);
        })
      );
      setTrend(
        months.map((m, i) => {
          const income = results[i]?.totalIncome ?? 0;
          const expense = results[i]?.totalExpense ?? 0;
          return {
            month: m,
            income,
            expense,
            balance: results[i]?.balance ?? (income - expense),
            pct: income > 0 ? Math.min(100, (expense / income) * 100) : 0,
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, []);

  return { trend, loading, fetchTrend };
}
