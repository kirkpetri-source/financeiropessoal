import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function PrivateRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-alt">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted">Carregando...</span>
        </div>
      </div>
    );
  }

  // Guarda para onde a pessoa tentou ir — sem isso, quem não estava logado e
  // caiu direto numa rota privada (o painel admin, por exemplo, que não tem
  // link em lugar nenhum) fazia login e voltava sempre pro /dashboard, nunca
  // pra página que pediu de verdade.
  return user ? <Outlet /> : <Navigate to="/login" state={{ from: location }} replace />;
}
