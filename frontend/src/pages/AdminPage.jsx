import { useState, useEffect } from 'react';
import {
  Loader2, Lock, BarChart3, Users, MessagesSquare, LifeBuoy, UserCog, Server,
} from 'lucide-react';
import api from '../services/api';
import DashboardTab from './plataforma/DashboardTab';
import ClientesTab from './plataforma/ClientesTab';
import ComunicacaoTab from './plataforma/ComunicacaoTab';
import ChamadosTab from './plataforma/ChamadosTab';
import OperadoresTab from './plataforma/OperadoresTab';
import SistemaTab from './plataforma/SistemaTab';

/**
 * CRM do operador do RevelaCash.
 *
 *   Dashboard    — MRR, churn, conversão e os gráficos de tendência.
 *   Clientes     — a lista de famílias: ações administrativas, notas do CRM,
 *                  histórico de WhatsApp.
 *   Chamados     — a fila do suporte.
 *   Comunicação  — templates e envio em massa por segmento de família.
 *   Equipe       — criar operador, papel e permissões (etapa 2 da Fase 4).
 *   Sistema      — custo de IA, backup e saúde da operação.
 *
 * NAVEGAÇÃO LATERAL, e não abas em linha. Com seis seções, abas empilhavam no
 * notebook e o rótulo virava a única pista do que era cada uma; a coluna deixa
 * o conjunto inteiro visível e sobra largura para tabela de cliente, que é o
 * conteúdo mais apertado daqui.
 *
 * `soAdmin` separa o que é do DONO do negócio do que é de quem ATENDE. Sem
 * essa distinção o painel desfaria, na tela, a separação que o backend faz:
 * um ATENDENTE tem permissão para a fila de chamados e não tem para métricas,
 * clientes e cobrança.
 */

const SECOES = [
  {
    grupo: 'Negócio',
    itens: [
      { chave: 'dashboard', rotulo: 'Dashboard', icon: BarChart3, Componente: DashboardTab, soAdmin: true },
      { chave: 'clientes', rotulo: 'Clientes', icon: Users, Componente: ClientesTab, soAdmin: true },
    ],
  },
  {
    grupo: 'Atendimento',
    itens: [
      { chave: 'chamados', rotulo: 'Chamados', icon: LifeBuoy, Componente: ChamadosTab, soAdmin: false },
      { chave: 'comunicacao', rotulo: 'Comunicação', icon: MessagesSquare, Componente: ComunicacaoTab, soAdmin: true },
    ],
  },
  {
    grupo: 'Administração',
    itens: [
      { chave: 'equipe', rotulo: 'Equipe', icon: UserCog, Componente: OperadoresTab, soAdmin: true },
      { chave: 'sistema', rotulo: 'Sistema', icon: Server, Componente: SistemaTab, soAdmin: true },
    ],
  },
];

const TODOS_OS_ITENS = SECOES.flatMap((s) => s.itens);

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
          ativo em `operadores`.
        </p>
      </div>
    );
  }

  const disponiveis = TODOS_OS_ITENS.filter((i) => ehAdmin || !i.soAdmin);
  const atual = aba && disponiveis.some((i) => i.chave === aba) ? aba : disponiveis[0].chave;
  const Ativa = disponiveis.find((i) => i.chave === atual).Componente;

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <nav className="w-full lg:w-52 lg:shrink-0 lg:sticky lg:top-6" aria-label="Seções do painel">
        {SECOES.map((secao) => {
          const itens = secao.itens.filter((i) => ehAdmin || !i.soAdmin);
          if (!itens.length) return null;

          return (
            <div key={secao.grupo} className="mb-4 last:mb-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-faint px-3 mb-1.5">
                {secao.grupo}
              </p>
              <ul className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
                {itens.map((item) => (
                  <li key={item.chave}>
                    <button
                      type="button"
                      onClick={() => setAba(item.chave)}
                      aria-current={atual === item.chave ? 'page' : undefined}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                                  transition-colors whitespace-nowrap
                                  ${atual === item.chave
                        ? 'bg-brand-light text-brand-dark font-medium'
                        : 'text-muted hover:text-ink hover:bg-surface-alt'}`}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {item.rotulo}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="flex-1 min-w-0 w-full">
        <Ativa />
      </div>
    </div>
  );
}
