import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  MessageCircle, Users, Eye, Wallet, BarChart3, ShieldCheck,
  ArrowRight, CheckCircle2, TrendingUp, TrendingDown, Percent, DollarSign,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../components/brand/Logo';
import AuthForm from '../components/auth/AuthForm';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';

/**
 * Landing page de vendas. Greenfield — não existia página pública além de
 * login/termos/privacidade antes desta rodada.
 *
 * Pendências conscientes, fora do escopo desta implementação:
 * - Fotos de pessoas reais: decisão/fonte do Kirk (banco licenciado ou fotos
 *   próprias) — não fabricamos foto de banco de imagens genérica aqui.
 * - Prints reais do sistema: a seção "como funciona" usa uma recriação
 *   estática dos componentes reais (mesmos tokens/classes do Dashboard) em
 *   vez de um screenshot de verdade, porque tirar print exigiria logar numa
 *   conta — real ou de teste — e a Fase 3 (dados) ainda está em validação.
 *   Trocar por print real é troca pontual de imagem, não de estrutura.
 */

const BENEFICIOS = [
  { icon: MessageCircle, title: 'Nada de instalar nada', desc: 'Você já vive no WhatsApp o dia inteiro. É só usar ele mesmo — sem senha nova, sem app pra baixar.' },
  { icon: Users, title: 'Do seu jeito, no seu ritmo', desc: 'Lança sozinho, a dois ou em grupo com a família inteira. Você escolhe como, o sistema se adapta.' },
  { icon: Eye, title: 'Organização automática', desc: 'Manda a mensagem do jeito que fala. O RevelaCash entende, categoriza e organiza sozinho, na hora.' },
  { icon: Wallet, title: 'Parcelamento sem esforço', desc: '"Geladeira 1200 em 10x" vira 10 lançamentos de R$120, um por mês. Você não faz a conta, o sistema faz.' },
  { icon: BarChart3, title: 'Clareza todo mês, sem esforço', desc: 'Gráfico por categoria, por pessoa, e um resumo que cabe numa olhada de 10 segundos.' },
  { icon: ShieldCheck, title: 'Seus dados, protegidos', desc: 'Criptografado e acessível só por quem você autorizar. Segurança de verdade, sem letra miúda.' },
];

const PASSOS = [
  { n: '1', title: 'Manda uma mensagem no zap', desc: '"gastei 45 no mercado pix" — do jeito que você já fala no dia a dia.' },
  { n: '2', title: 'O sistema organiza sozinho', desc: 'Identifica tipo, valor, categoria e quem pagou. Confirma na hora, no próprio WhatsApp.' },
  { n: '3', title: 'Você vê tudo organizado', desc: 'Sozinho ou em grupo, todo mundo enxerga pra onde o dinheiro está indo — sem perguntar, sem cobrar.' },
];

export default function LandingPage() {
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authAba, setAuthAba] = useState('entrar');

  // `user.id` só existe depois que o perfil e a família nascem no backend.
  // Logo após o cadastro, o Firebase já autenticou mas o backend ainda não
  // respondeu — nesse instante `user` é um objeto mínimo (sem `id`), e
  // redirecionar por qualquer `user` truthy jogava pro Dashboard antes da
  // família existir, deixando a tela presa carregando pra sempre.
  if (user?.id) return <Navigate to="/dashboard" replace />;

  function abrirAuth(aba) {
    setAuthAba(aba);
    setAuthOpen(true);
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* ── Nav ── */}
      <header className="border-b border-border bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => abrirAuth('entrar')}
              className="text-sm font-medium text-muted hover:text-ink hidden sm:block"
            >
              Entrar
            </button>
            <button type="button" onClick={() => abrirAuth('criar')} className="btn-primary text-sm py-2">
              Criar conta grátis
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-revealcontent">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-dark bg-brand-light px-3 py-1 rounded-full">
              <Eye className="w-3.5 h-3.5" /> Financeiro revelado, não escondido
            </span>
            <h1 className="mt-5 text-3xl sm:text-5xl font-extrabold leading-tight tracking-tight">
              Envie seus gastos e receitas<br />
              pelo <span className="text-brand">WhatsApp</span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-muted max-w-lg">
              O RevelaCash organiza tudo automaticamente e mostra, com
              clareza, para onde o seu dinheiro está indo — sozinho, em
              casal ou com toda a família.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => abrirAuth('criar')}
                className="btn-primary justify-center flex items-center gap-2 py-3 px-6 text-base"
              >
                Criar conta grátis <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => abrirAuth('entrar')}
                className="btn-secondary justify-center flex items-center gap-2 py-3 px-6 text-base"
              >
                Já sou cliente
              </button>
            </div>
            <p className="mt-4 text-xs text-faint">
              7 dias grátis, sem cartão. Depois, R$ 24,90/mês por família — não por pessoa.
            </p>
          </div>

          {/* Mini-recreação estática do Dashboard real (mesmos tokens/cores),
              não é screenshot — ver nota no topo do arquivo. */}
          <div className="animate-revealcontent" style={{ animationDelay: '0.12s' }}>
            <div className="rounded-2xl border border-border bg-white shadow-modal p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Painel Financeiro</p>
                  <p className="text-[11px] text-faint">Agosto de 2026</p>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-dark bg-brand-light px-2.5 py-1 rounded-lg">
                  <Users className="w-3 h-3" /> Paulo Sérgio &amp; Marta
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 mb-3">
                <MockKpi icon={TrendingUp} label="Receitas" value="R$ 8.400" color="#0d9488" />
                <MockKpi icon={TrendingDown} label="Despesas" value="R$ 5.180" color="#dc2626" />
                <MockKpi icon={DollarSign} label="Saldo" value="R$ 3.220" color="#2563eb" />
                <MockKpi icon={Percent} label="Comprometido" value="61,7%" color="#5b21b6" />
              </div>

              <div className="rounded-xl border border-border bg-surface-alt p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-faint mb-2">Confirmado no WhatsApp</p>
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-income flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageCircle className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-white rounded-xl rounded-tl-sm border border-border px-3 py-2 text-xs">
                    ✅ Despesa de <strong>R$ 84,90</strong> em <strong>Mercado</strong> registrada.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Como funciona ── */}
      <section className="bg-white border-y border-border py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center">Como funciona</h2>
          <p className="text-center text-muted mt-2 max-w-xl mx-auto">
            Três passos, e nenhum deles pede pra você abrir uma planilha.
          </p>
          <div className="mt-12 grid sm:grid-cols-3 gap-8">
            {PASSOS.map((p) => (
              <div key={p.n} className="text-center sm:text-left">
                <div className="w-10 h-10 rounded-xl bg-brand text-white font-extrabold flex items-center justify-center mx-auto sm:mx-0">
                  {p.n}
                </div>
                <h3 className="mt-4 font-bold text-lg">{p.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefícios ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-center">Controle financeiro sem esforço nenhum</h2>
        <p className="text-center text-muted mt-2 max-w-xl mx-auto">
          Zero planilha, zero digitação manual. Você manda a mensagem, o RevelaCash organiza —
          e sobra só a parte boa: saber pra onde o dinheiro está indo.
        </p>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {BENEFICIOS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card">
              <div className="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center">
                <Icon className="w-4.5 h-4.5 text-brand-dark" />
              </div>
              <h3 className="mt-3 font-bold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Preço ── */}
      <section className="bg-ink text-white py-16 sm:py-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold">Um preço, a família inteira</h2>
          <p className="mt-3 text-white/70">Sem plano por pessoa, sem letra miúda.</p>

          <div className="mt-8 bg-white text-ink rounded-2xl p-6 sm:p-8 shadow-modal">
            <p className="text-4xl sm:text-5xl font-extrabold">
              R$ 24,90<span className="text-lg font-medium text-muted">/mês</span>
            </p>
            <p className="text-sm text-muted mt-1">por família — não por pessoa, até 8 integrantes</p>

            <ul className="mt-6 space-y-2.5 text-left max-w-xs mx-auto">
              {BENEFICIOS.slice(0, 5).map(({ title }) => (
                <li key={title} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-income flex-shrink-0 mt-0.5" />
                  {title}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => abrirAuth('criar')}
              className="btn-primary w-full justify-center flex items-center gap-2 py-3 mt-7 text-base"
            >
              Começar 7 dias grátis <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-xs text-faint mt-3">Sem cartão de crédito no cadastro.</p>
          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-extrabold">
          Pare de descobrir o gasto <span className="text-brand">no fim do mês</span>
        </h2>
        <p className="mt-3 text-muted">Comece hoje. Sua família já manda mensagem — só falta o sistema organizar.</p>
        <button
          type="button"
          onClick={() => abrirAuth('criar')}
          className="btn-primary inline-flex items-center gap-2 py-3 px-7 text-base mt-7"
        >
          Criar conta grátis <ArrowRight className="w-4 h-4" />
        </button>
      </section>

      {/* ── Entrar / criar conta — modal inline, sem sair da landing ── */}
      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="max-w-md">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <Logo size="lg" withWordmark={false} />
            </div>
            <DialogTitle className="text-xl font-bold">
              <span className="text-ink">Revela</span><span className="text-brand">Cash</span>
            </DialogTitle>
            <p className="text-sm text-muted mt-1">O financeiro revelado no WhatsApp</p>
          </div>
          <AuthForm initialAba={authAba} />
        </DialogContent>
      </Dialog>

      {/* ── Rodapé ── */}
      <footer className="border-t border-border bg-white py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size="sm" />
          <div className="text-xs text-faint text-center sm:text-right space-y-1">
            <p>LION TECH SOLUÇÕES EM TI LTDA · CNPJ 44.124.574/0001-47 · Mineiros-GO</p>
            <p>
              <a href="https://instagram.com/revelacash" target="_blank" rel="noreferrer" className="underline hover:text-muted">
                @revelacash
              </a>
              {' · '}
              <Link to="/termos" className="underline hover:text-muted">Termos de uso</Link>
              {' · '}
              <Link to="/privacidade" className="underline hover:text-muted">Política de privacidade</Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MockKpi({ icon: Icon, label, value, color }) {
  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: color }}>
          <Icon className="w-3 h-3 text-white" />
        </div>
        <span className="text-[9.5px] font-bold uppercase tracking-wide text-muted">{label}</span>
      </div>
      <p className="font-mono text-base font-bold" style={{ color }}>{value}</p>
    </div>
  );
}
