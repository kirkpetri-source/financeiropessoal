import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Tag,
  Settings,
  MessageSquare,
  CreditCard,
  PiggyBank,
  CalendarClock,
  Wallet,
  Upload,
  Sparkles,
  X,
  LifeBuoy,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAssistenteDisponivel } from '../../contexts/AssistenteContext';
import { useAssinatura } from '../../contexts/AssinaturaContext';
import Logo from '../brand/Logo';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Lançamentos' },
  { to: '/categories', icon: Tag, label: 'Categorias' },
  { to: '/orcamento', icon: PiggyBank, label: 'Orçamento' },
  { to: '/contas-recorrentes', icon: CalendarClock, label: 'Contas Fixas' },
  { to: '/faturas', icon: Wallet, label: 'Faturas' },
  { to: '/importar', icon: Upload, label: 'Importar extrato' },
  // "Assistente", e nao "Consultor": consultoria e assessoria de valores
  // mobiliarios sao atividades REGULADAS pela CVM. O nome nao pode sugerir
  // que a familia esta recebendo servico de profissional habilitado.
  //
  // `soSeDisponivel` esconde o item de quem ainda nao tem a feature liberada.
  // Quem decide e o BACKEND (ASSISTENTE_FAMILIAS) — o navegador so pergunta.
  // Sem isso, as familias sem acesso veriam um item marcado como NOVO, com
  // selo chamando atencao, que ao ser clicado responde "assistente
  // indisponivel": anunciar novidade que nao funciona e pior que nao anunciar.
  { to: '/assistente', icon: Sparkles, label: 'Assistente', novo: true, soSeDisponivel: true },
  { to: '/whatsapp-logs', icon: MessageSquare, label: 'WhatsApp' },
  { to: '/suporte', icon: LifeBuoy, label: 'Suporte' },
  { to: '/assinatura', icon: CreditCard, label: 'Assinatura' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const { assinatura } = useAssinatura();

  // Pastilha no menu quando a assinatura pede atenção — o cliente que ignorou o
  // banner ainda vê que existe algo pendente.
  const alertaDeAssinatura = assinatura && (!assinatura.podeLancar || assinatura.emCarencia);

  const { disponivel: assistenteDisponivel } = useAssistenteDisponivel();

  // Itens marcados com `soSeDisponivel` dependem de a feature estar liberada
  // para esta família. Todo o resto do menu é igual para todo mundo.
  const itensVisiveis = NAV_ITEMS.filter(
    (item) => !item.soSeDisponivel || assistenteDisponivel,
  );

  return (
    <aside
      className={`
        fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-border
        flex flex-col transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
      `}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-border">
        <Logo size="sm" />
        <button
          onClick={onClose}
          className="lg:hidden p-1 rounded-lg text-faint hover:text-ink"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {itensVisiveis.map(({ to, icon: Icon, label, novo }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-light text-brand-dark'
                  : 'text-muted hover:bg-surface-alt hover:text-ink'
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{label}</span>
            {to === '/assinatura' && alertaDeAssinatura && (
              <span className="w-2 h-2 rounded-full bg-expense flex-shrink-0" />
            )}
            {novo && (
              <span className="text-[9px] font-bold tracking-wide bg-accent-light text-accent-dark px-1.5 py-0.5 rounded-full flex-shrink-0">
                NOVO
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-light rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-brand-dark text-xs font-bold">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink truncate">{user?.name}</p>
            <p className="text-xs text-faint truncate">{user?.email}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
