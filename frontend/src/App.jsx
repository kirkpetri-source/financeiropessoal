import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AssinaturaProvider } from './contexts/AssinaturaContext';
import { AssistenteProvider } from './contexts/AssistenteContext';
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
import ImportarExtratoPage from './pages/ImportarExtratoPage';
import SettingsPage from './pages/SettingsPage';
import WhatsappLogsPage from './pages/WhatsappLogsPage';
import SuportePage from './pages/SuportePage';
import ChamadoPage from './pages/ChamadoPage';
import AssinaturaPage from './pages/AssinaturaPage';
import PlataformaPage from './pages/PlataformaPage';
import TermosPage from './pages/legal/TermosPage';
import PrivacidadePage from './pages/legal/PrivacidadePage';

// Carregada sob demanda: so quem abre a assistente paga o download dela.
const AssistentePage = lazy(() => import('./pages/AssistentePage'));

export default function App() {
  return (
    <AuthProvider>
      <AssinaturaProvider>
        <AssistenteProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Termos e privacidade abrem sem login: a landing page e o próprio
                Mercado Pago linkam para cá, e exigir conta para ler o contrato
                seria o contrário do que a LGPD pede. */}
            <Route path="/termos" element={<TermosPage />} />
            <Route path="/privacidade" element={<PrivacidadePage />} />

            {/* Portal do operador — login próprio (usuário/senha), sem relação
                com a conta de nenhuma família. Fica FORA do PrivateRoute de
                propósito: não usa a sessão nem o layout da família, tem o
                gate de acesso dele mesmo (ver PlataformaPage.jsx). */}
            <Route path="/plataforma" element={<PlataformaPage />} />

            <Route element={<PrivateRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/orcamento" element={<BudgetsPage />} />
                <Route path="/contas-recorrentes" element={<RecurringBillsPage />} />
                <Route path="/faturas" element={<InvoicesPage />} />
                <Route path="/importar" element={<ImportarExtratoPage />} />
                <Route
                  path="/assistente"
                  element={(
                    <Suspense fallback={<div className="py-16 text-center text-muted text-sm">Carregando…</div>}>
                      <AssistentePage />
                    </Suspense>
                  )}
                />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/whatsapp-logs" element={<WhatsappLogsPage />} />
                <Route path="/suporte" element={<SuportePage />} />
                <Route path="/suporte/:numero" element={<ChamadoPage />} />
                <Route path="/assinatura" element={<AssinaturaPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </AssistenteProvider>
      </AssinaturaProvider>
    </AuthProvider>
  );
}
