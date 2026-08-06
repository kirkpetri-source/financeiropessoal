import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AssinaturaProvider } from './contexts/AssinaturaContext';
import PrivateRoute from './routes/PrivateRoute';
import AppLayout from './components/layout/AppLayout';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import CategoriesPage from './pages/CategoriesPage';
import SettingsPage from './pages/SettingsPage';
import WhatsappLogsPage from './pages/WhatsappLogsPage';
import AssinaturaPage from './pages/AssinaturaPage';
import AdminPage from './pages/AdminPage';
import TermosPage from './pages/legal/TermosPage';
import PrivacidadePage from './pages/legal/PrivacidadePage';

export default function App() {
  return (
    <AuthProvider>
      <AssinaturaProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            {/* Termos e privacidade abrem sem login: a landing page e o próprio
                Mercado Pago linkam para cá, e exigir conta para ler o contrato
                seria o contrário do que a LGPD pede. */}
            <Route path="/termos" element={<TermosPage />} />
            <Route path="/privacidade" element={<PrivacidadePage />} />

            <Route element={<PrivateRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/whatsapp-logs" element={<WhatsappLogsPage />} />
                <Route path="/assinatura" element={<AssinaturaPage />} />
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AssinaturaProvider>
    </AuthProvider>
  );
}
