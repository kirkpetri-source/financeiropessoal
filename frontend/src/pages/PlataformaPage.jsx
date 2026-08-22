import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { Lock, LogOut, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { authPlataforma } from '../config/firebase';
import api, { CHAVE_TOKEN_PLATAFORMA } from '../services/api';
import AdminPage from './AdminPage';

/**
 * Portal do operador — /plataforma.
 *
 * Deliberadamente FORA da família: não usa AuthContext, não passa por
 * PrivateRoute/AppLayout, não tem household. Login próprio (usuário/senha,
 * criado com tools/criar-login-operador.js), traduzido pra um e-mail
 * interno só porque o Firebase Auth exige formato de e-mail — ninguém lê
 * essa caixa.
 *
 * SESSÃO PRÓPRIA, e isso é requisito. Este portal autentica no app Firebase
 * NOMEADO `plataforma` (`authPlataforma`), não no app padrão que a família
 * usa, e guarda o token numa chave separada do localStorage. Até 22/08/2026
 * os dois compartilhavam a mesma sessão: entrar aqui sobrescrevia a sessão da
 * família e, no F5 seguinte, a aba do cliente exibia "Olá, Operador" — o
 * mesmo uid respondendo pelos dois lados. Agora as duas contas podem ficar
 * abertas lado a lado, no mesmo navegador, sem se atropelar.
 */

const DOMINIO_INTERNO = 'operador.revelacash.internal';

function LoginOperador({ onEntrar }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!usuario.trim() || !senha) return;
    setCarregando(true);
    try {
      await onEntrar(usuario.trim(), senha);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-ink rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-semibold text-ink">Portal do Operador</h1>
          <p className="text-xs text-faint mt-1">Acesso restrito</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Usuário</label>
            <input
              className="input"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label">Senha</label>
            <input
              type="password"
              className="input"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={carregando || !usuario.trim() || !senha}
            className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
          >
            {carregando ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</> : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function PlataformaPage() {
  const [status, setStatus] = useState('verificando'); // verificando | negado | autenticado

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(authPlataforma, async (firebaseUser) => {
      if (!firebaseUser || !firebaseUser.email?.endsWith(`@${DOMINIO_INTERNO}`)) {
        setStatus('negado');
        return;
      }
      try {
        const token = await firebaseUser.getIdToken();
        localStorage.setItem(CHAVE_TOKEN_PLATAFORMA, token);

        // Duas portas, e basta UMA. Admin entra pelas métricas; quem só atende
        // chamado entra pela fila. Testar só as métricas — como esta tela fazia
        // até 21/08/2026 — recusava o atendente aqui, antes de o AdminPage
        // sequer rodar, e a coleção `operadores` não serviria para nada.
        //
        // Qual aba ele vê é decidido lá dentro; aqui só se pergunta se ele tem
        // alguma coisa para fazer neste painel.
        const portas = await Promise.allSettled([
          api.get('/plataforma/metricas'),
          api.get('/plataforma/chamados', { params: { limite: 1 } }),
        ]);

        setStatus(portas.some((p) => p.status === 'fulfilled') ? 'autenticado' : 'negado');
      } catch {
        setStatus('negado');
      }
    });
    return unsubscribe;
  }, []);

  async function entrar(usuario, senha) {
    try {
      await signInWithEmailAndPassword(authPlataforma, `${usuario}@${DOMINIO_INTERNO}`, senha);
      // onAuthStateChanged acima confere o acesso e troca o status.
    } catch (err) {
      const msg = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(err.code)
        ? 'Usuário ou senha incorretos.'
        : 'Erro ao entrar. Tente de novo.';
      toast.error(msg);
    }
  }

  async function sair() {
    await signOut(authPlataforma);
    localStorage.removeItem(CHAVE_TOKEN_PLATAFORMA);
    setStatus('negado');
  }

  if (status === 'verificando') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-alt">
        <Loader2 className="w-6 h-6 animate-spin text-faint" />
      </div>
    );
  }

  if (status === 'negado') {
    return <LoginOperador onEntrar={entrar} />;
  }

  return (
    <div className="min-h-screen bg-surface-alt">
      <header className="bg-ink text-white px-6 py-3 flex items-center justify-between">
        <span className="text-sm font-medium">Portal do Operador — RevelaCash</span>
        <button onClick={sair} className="text-xs flex items-center gap-1.5 text-white/70 hover:text-white">
          <LogOut className="w-3.5 h-3.5" /> Sair
        </button>
      </header>
      {/* Largura maior que a do painel do cliente: aqui cabem uma coluna de
          navegação e uma tabela de clientes lado a lado. */}
      <main className="p-4 sm:p-6 max-w-[1400px] mx-auto">
        <AdminPage />
      </main>
    </div>
  );
}
