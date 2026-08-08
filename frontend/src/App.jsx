import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AssinaturaProvider } from './contexts/AssinaturaContext';
import PrivateRoute from './routes/PrivateRoute';
import AppLayout from './components/layout/AppLayout';

import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import CategoriesPage from './pages/CategoriesPage';
import BudgetsPage from './pages/BudgetsPage';
import RecurringBillsPage from './pages/RecurringBillsPage';
import InvoicesPage from './pages/InvoicesPage';
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
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Termos e privacidade abrem sem login: a landing page e o próprio
                Mercado Pago linkam para cá, e exigir conta para ler o contrato
                seria o contrário do que a LGPD pede. */}
            <Route path="/termos" element={<TermosPage />} />
            <Route path="/privacidade" element={<PrivacidadePage />} />

            <Route element={<PrivateRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/orcamento" element={<BudgetsPage />} />
                <Route path="/contas-recorrentes" element={<RecurringBillsPage />} />
                <Route path="/faturas" element={<InvoicesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/whatsapp-logs" element={<WhatsappLogsPage />} />
                <Route path="/assinatura" element={<AssinaturaPage />} />
                {/* URL propositalmente não-óbvia — ver comentário em routes/admin.js
                    no backend. A proteção real é o apenasAdmin do backend, não o
                    caminho em si; isto só evita descoberta casual por "/admin". */}
                <Route path="/portal-rc-9f21" element={<AdminPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AssinaturaProvider>
    </AuthProvider>
  );
}
