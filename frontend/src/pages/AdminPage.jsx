import { useState, useEffect } from 'react';
import { Loader2, Lock, BarChart3, Users, MessagesSquare, LifeBuoy } from 'lucide-react';
import api from '../services/api';
import DashboardTab from './plataforma/DashboardTab';
import ClientesTab from './plataforma/ClientesTab';
import ComunicacaoTab from './plataforma/ComunicacaoTab';
import ChamadosTab from './plataforma/ChamadosTab';

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

/**
 * `soAdmin` separa o que é do DONO do negócio do que é de quem ATENDE.
 *
 * Sem essa distinção o painel desfaria, na tela, a separação que o backend faz:
 * um ATENDENTE tem permissão para a fila de chamados e NÃO tem para métricas,
 * clientes e cobrança. A versão anterior liberava a tela inteira testando
 * `/plataforma/metricas` — ou seja, um atendente veria "Acesso restrito" e a
 * coleção `operadores` não serviria para nada.
 */
const ABAS = [
  { chave: 'dashboard', rotulo: 'Dashboard', icon: BarChart3, Componente: DashboardTab, soAdmin: true },
  { chave: 'clientes', rotulo: 'Clientes', icon: Users, Componente: ClientesTab, soAdmin: true },
  { chave: 'comunicacao', rotulo: 'Comunicação', icon: MessagesSquare, Componente: ComunicacaoTab, soAdmin: true },
  { chave: 'chamados', rotulo: 'Chamados', icon: LifeBuoy, Componente: ChamadosTab, soAdmin: false },
];

export default function AdminPage() {
  const [carregando, setCarregando] = useState(true);
  const [ehAdmin, setEhAdmin] = useState(false);
  const [ehOperador, setEhOperador] = useState(false);
  const [aba, setAba] = useState(null);

  useEffect(() => {
    // Duas perguntas, e não uma: "sou administrador?" e "atendo chamado?".
    // São permissões diferentes no backend, e quem só atende precisa entrar.
    Promise.allSettled([
      api.get('/plataforma/metricas'),
      api.get('/plataforma/chamados', { params: { limite: 1 } }),
    ])
      .then(([metricas, chamados]) => {
        setEhAdmin(metricas.status === 'fulfilled');
        setEhOperador(chamados.status === 'fulfilled');
      })
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-faint" /></div>;
  }

  if (!ehAdmin && !ehOperador) {
    return (
      <div className="card max-w-md mx-auto text-center space-y-2">
        <Lock className="w-6 h-6 text-faint mx-auto" />
        <p className="text-sm font-medium text-ink">Acesso restrito</p>
        <p className="text-xs text-muted">
          Este painel é da operação do serviço. Para o painel completo, o e-mail
          precisa estar em ADMIN_EMAILS; para atender chamados, basta um registro
          ativo em `operadores` (tools/criar-login-operador.js).
        </p>
      </div>
    );
  }

  const abasVisiveis = ABAS.filter((a) => ehAdmin || !a.soAdmin);
  const abaAtual = aba && abasVisiveis.some((a) => a.chave === aba) ? aba : abasVisiveis[0].chave;
  const AbaAtiva = abasVisiveis.find((a) => a.chave === abaAtual).Componente;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">CRM RevelaCash</h1>
        <p className="text-sm text-muted">Operação, clientes e comunicação — tudo num lugar só.</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {abasVisiveis.map((a) => (
          <button
            key={a.chave}
            type="button"
            onClick={() => setAba(a.chave)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${abaAtual === a.chave ? 'border-brand-700 text-brand-700' : 'border-transparent text-muted hover:text-ink'}`}
          >
            <a.icon className="w-4 h-4" /> {a.rotulo}
          </button>
        ))}
      </div>

      <AbaAtiva />
    </div>
  );
}
