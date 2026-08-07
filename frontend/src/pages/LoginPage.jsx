import { useSearchParams, Link } from 'react-router-dom';
import Logo from '../components/brand/Logo';
import AuthForm from '../components/auth/AuthForm';

/**
 * Entrada do sistema por link direto — e-mail de recuperação de senha, sessão
 * expirada (PrivateRoute redireciona pra cá), ou alguém que já tem /login
 * salvo nos favoritos. Quem chega pela landing page usa o modal inline
 * (ver LandingPage.jsx) e nunca passa por aqui.
 */
export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const initialAba = searchParams.get('aba') === 'criar' ? 'criar' : 'entrar';

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg flex items-center justify-center p-4">
      {/* Cortina de revelação — expressa o conceito de marca (revelar o
          que estava oculto) como animação de entrada, só CSS. */}
      <div
        className="pointer-events-none absolute inset-0 z-10 bg-ink animate-curtain motion-reduce:hidden"
        aria-hidden="true"
      />

      <div className="w-full max-w-md animate-revealcontent motion-reduce:animate-none motion-reduce:opacity-100">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size="lg" withWordmark={false} />
          </div>
          <h1 className="text-2xl font-bold text-ink">
            <span className="text-ink">Revela</span><span className="text-brand">Cash</span>
          </h1>
          <p className="text-muted mt-1">O financeiro da família, revelado no WhatsApp</p>
        </div>

        <div className="bg-white rounded-card shadow-modal border border-border p-6 sm:p-8">
          <AuthForm initialAba={initialAba} />
        </div>

        <p className="text-center text-xs text-faint mt-6">
          RevelaCash © {new Date().getFullYear()}
          <br />
          <Link to="/termos" className="underline hover:text-muted">Termos de uso</Link>
          {' · '}
          <Link to="/privacidade" className="underline hover:text-muted">Política de privacidade</Link>
        </p>
      </div>
    </div>
  );
}
