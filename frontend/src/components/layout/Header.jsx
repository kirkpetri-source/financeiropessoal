import { Menu, LogOut, ChevronDown, HelpCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTour } from '../../contexts/TourContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/transactions': 'Lançamentos',
  '/categories': 'Categorias',
  '/settings': 'Configurações',
  '/whatsapp-logs': 'Mensagens WhatsApp',
  '/assinatura': 'Assinatura',
  '/admin': 'Painel administrativo',
};

export default function Header({ onMenuClick }) {
  const { logout, user } = useAuth();
  const { startTour } = useTour();
  const navigate = useNavigate();
  const location = useLocation();

  const title = PAGE_TITLES[location.pathname] || 'RevelaCash';
  const initial = user?.name?.charAt(0).toUpperCase() || '?';

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="h-14 bg-white border-b border-border flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-muted hover:bg-surface-alt"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-ink">{title}</h1>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-light text-xs font-bold text-brand-dark">
            {initial}
          </span>
          <span className="hidden sm:block text-muted">
            Olá, {user?.name?.split(' ')[0]}
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-faint sm:block" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={startTour}>
            <HelpCircle className="h-4 w-4" />
            Tour guiado
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
