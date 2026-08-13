import { useState, useEffect } from 'react';
import { Loader2, Lock, BarChart3, Users, MessagesSquare } from 'lucide-react';
import api from '../services/api';
import DashboardTab from './plataforma/DashboardTab';
import ClientesTab from './plataforma/ClientesTab';
import ComunicacaoTab from './plataforma/ComunicacaoTab';

/**
 * CRM do operador do RevelaCash — três abas:
 *
 *   Dashboard    — MRR, churn, conversão e os gráficos de tendência.
 *   Clientes     — a lista de famílias (ações administrativas, notas do CRM,
 *                  histórico de WhatsApp) — era a tela inteira antes desta
 *                  reforma, agora é uma aba.
 *   Comunicação  — templates e envio em massa de avisos/novidades/dicas pelo
 *                  WhatsApp, por segmento de família.
 *
 * Nada das ações administrativas por família mudou de rota nem de
 * comportamento — só ganharam um lugar (aba "Clientes") e vizinhos (Notas,
 * Mensagens) dentro do mesmo drawer que já existia.
 */

const ABAS = [
  { chave: 'dashboard', rotulo: 'Dashboard', icon: BarChart3, Componente: DashboardTab },
  { chave: 'clientes', rotulo: 'Clientes', icon: Users, Componente: ClientesTab },
  { chave: 'comunicacao', rotulo: 'Comunicação', icon: MessagesSquare, Componente: ComunicacaoTab },
];

export default function AdminPage() {
  const [carregando, setCarregando] = useState(true);
  const [semAcesso, setSemAcesso] = useState(false);
  const [aba, setAba] = useState('dashboard');

  useEffect(() => {
    api.get('/plataforma/metricas')
      .then(() => setSemAcesso(false))
      .catch((err) => { if (err.response?.status === 403) setSemAcesso(true); })
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-faint" /></div>;
  }

  if (semAcesso) {
    return (
      <div className="card max-w-md mx-auto text-center space-y-2">
        <Lock className="w-6 h-6 text-faint mx-auto" />
        <p className="text-sm font-medium text-ink">Acesso restrito</p>
        <p className="text-xs text-muted">
          Este painel é da operação do serviço. Configure ADMIN_EMAILS no backend
          para liberar o seu e-mail.
        </p>
      </div>
    );
  }

  const AbaAtiva = ABAS.find((a) => a.chave === aba)?.Componente || DashboardTab;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">CRM RevelaCash</h1>
        <p className="text-sm text-muted">Operação, clientes e comunicação — tudo num lugar só.</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {ABAS.map((a) => (
          <button
            key={a.chave}
            type="button"
            onClick={() => setAba(a.chave)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === a.chave ? 'border-brand-700 text-brand-700' : 'border-transparent text-muted hover:text-ink'}`}
          >
            <a.icon className="w-4 h-4" /> {a.rotulo}
          </button>
        ))}
      </div>

      <AbaAtiva />
    </div>
  );
}
