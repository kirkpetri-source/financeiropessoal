import { Link, Navigate } from 'react-router-dom';
import {
  MessageCircle, Users, Eye, Wallet, BarChart3, ShieldCheck,
  ArrowRight, CheckCircle2, TrendingUp, TrendingDown, Percent, DollarSign,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../components/brand/Logo';

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
  { icon: MessageCircle, title: 'Sem app novo pra baixar', desc: 'Lança pelo WhatsApp que sua família já usa. Sem senha pra decorar, sem baixar nada.' },
  { icon: Users, title: 'Visão compartilhada de verdade', desc: 'Casal, pais e filhos veem o gasto um do outro no mesmo grupo. Ninguém descobre a fatura no fim do mês.' },
  { icon: Eye, title: 'Categoriza sozinho', desc: '"Mercado 84,90 pix" vira lançamento organizado, com categoria certa, na hora.' },
  { icon: Wallet, title: 'Parcela sozinho também', desc: '"Geladeira 1200 em 10x" vira 10 lançamentos de R$120, um por mês, sem você fazer conta.' },
  { icon: BarChart3, title: 'Relatório pronto todo mês', desc: 'Gráfico por categoria, por pessoa, e um resumo que cabe numa olhada de 10 segundos.' },
  { icon: ShieldCheck, title: 'Seus dados são seus', desc: 'Exportação em um clique, a qualquer momento. Cancelar não tranca seu histórico.' },
];

const PASSOS = [
  { n: '1', title: 'Manda uma mensagem no zap', desc: '"gastei 45 no mercado pix" — do jeito que você já fala no dia a dia.' },
  { n: '2', title: 'O sistema organiza sozinho', desc: 'Identifica tipo, valor, categoria e quem pagou. Confirma na hora, no próprio WhatsApp.' },
  { n: '3', title: 'A família vê tudo junto', desc: 'Todo mundo do grupo enxerga pra onde o dinheiro está indo — sem perguntar, sem cobrar.' },
];

export default function LandingPage() {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* ── Nav ── */}
      <header className="border-b border-border bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-muted hover:text-ink hidden sm:block">
              Entrar
            </Link>
            <Link to="/login" className="btn-primary text-sm py-2">
              Criar conta grátis
            </Link>
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
              Pra onde está indo<br />
              <span className="text-brand">o dinheiro</span> da sua família?
            </h1>
            <p className="mt-5 text-base sm:text-lg text-muted max-w-lg">
              O RevelaCash organiza os gastos da família direto do WhatsApp — sem
              planilha, sem app novo, sem ninguém ficar no escuro sobre pra onde
              o dinheiro está indo.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/login" className="btn-primary justify-center flex items-center gap-2 py-3 px-6 text-base">
                Criar conta grátis <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/login" className="btn-secondary justify-center flex items-center gap-2 py-3 px-6 text-base">
                Já sou cliente
              </Link>
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
                  <Users className="w-3 h-3" /> Kirk &amp; Raquel
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
        <h2 className="text-2xl sm:text-3xl font-extrabold text-center">Por que trocar a planilha pelo RevelaCash</h2>
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

            <Link
              to="/login"
              className="btn-primary w-full justify-center flex items-center gap-2 py-3 mt-7 text-base"
            >
              Começar 7 dias grátis <ArrowRight className="w-4 h-4" />
            </Link>
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
        <Link
          to="/login"
          className="btn-primary inline-flex items-center gap-2 py-3 px-7 text-base mt-7"
        >
          Criar conta grátis <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

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
