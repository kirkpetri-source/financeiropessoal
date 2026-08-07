import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  MessageCircle, Users, User, Home, Eye, ArrowLeftRight, History, FileBarChart,
  ArrowRight, ArrowDown, CheckCircle2, X, ChevronDown,
  TrendingUp, TrendingDown, DollarSign, Tag,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../components/brand/Logo';
import AuthForm from '../components/auth/AuthForm';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';

/**
 * Landing page de vendas.
 *
 * Reescrita de conteúdo (08/08/2026): a versão anterior tinha copy
 * publicitária genérica ("Nada de instalar nada", "Você já vive no
 * WhatsApp") que não explicava o produto. Toda seção segue a mesma lógica —
 * usuário manda mensagem no WhatsApp → RevelaCash registra → dado organizado
 * aparece no painel — sem prometer resultado financeiro nem parecer banco,
 * conta digital ou carteira. Só descreve funcionalidade que existe de
 * verdade no sistema (ver DashboardPage, TransactionsPage, CategoriesPage,
 * AssinaturaContext.cancelar, TermosPage).
 *
 * Pendências conscientes, fora do escopo desta implementação:
 * - Fotos de pessoas reais e prints reais do sistema: ver nota histórica no
 *   commit anterior. As recriações abaixo usam os mesmos tokens/cores do
 *   Dashboard real, não são screenshot.
 * - Números de categorias/exemplos são ilustrativos, marcados como tal.
 */

const BENEFICIOS = [
  { icon: Eye, title: 'Visão dos gastos', desc: 'Veja quais categorias estão consumindo mais dinheiro durante o mês.' },
  { icon: ArrowLeftRight, title: 'Receitas e despesas', desc: 'Acompanhe quanto entrou, quanto saiu e qual é o seu saldo.' },
  { icon: History, title: 'Histórico', desc: 'Consulte suas movimentações sem depender da memória ou de anotações espalhadas.' },
  { icon: FileBarChart, title: 'Relatórios', desc: 'Visualize seus dados de forma organizada para entender melhor seus hábitos financeiros.' },
];

const PASSOS = [
  {
    n: '01',
    title: 'Envie pelo WhatsApp',
    desc: 'Informe o gasto ou a receita do jeito que você normalmente falaria.',
    visual: <ChatBubbleOut texto="Gastei R$ 120 no supermercado." />,
  },
  {
    n: '02',
    title: 'O RevelaCash registra',
    desc: 'O sistema identifica as informações da mensagem e adiciona a movimentação ao seu controle financeiro.',
    visual: <MovimentacaoCard tipo="Despesa" valor="R$ 120,00" categoria="Supermercado" quando="Hoje" />,
  },
  {
    n: '03',
    title: 'Acompanhe tudo organizado',
    desc: 'Consulte receitas, despesas, saldo, categorias e relatórios para entender como o seu dinheiro está sendo utilizado.',
    visual: (
      <div className="flex flex-wrap gap-1.5">
        {['Mercado', 'Transporte', 'Contas'].map((c) => (
          <span key={c} className="text-xs font-medium text-brand-dark bg-brand-light px-2.5 py-1 rounded-lg">{c}</span>
        ))}
      </div>
    ),
  },
];

const CATEGORIAS_EXEMPLO = [
  { nome: 'Mercado', valor: 1240, max: 1240 },
  { nome: 'Alimentação', valor: 680, max: 1240 },
  { nome: 'Combustível', valor: 520, max: 1240 },
  { nome: 'Assinaturas', valor: 189, max: 1240 },
];

const MENSAGENS_EXEMPLO = [
  'Gastei R$ 52 no combustível.',
  'Recebi R$ 3.500 de salário.',
  'Paguei R$ 129 de internet.',
  'Mercado R$ 287,40.',
];

const MODOS_DE_USO = [
  { icon: User, titulo: 'Individual', desc: 'Registre suas receitas e despesas e acompanhe sua própria vida financeira.' },
  { icon: Users, titulo: 'Casal', desc: 'Centralize as movimentações da casa para que os dois tenham uma visão mais clara das finanças.' },
  { icon: Home, titulo: 'Família', desc: 'Reúna os lançamentos dos participantes e acompanhe as despesas familiares em um único lugar.' },
];

const CALLOUTS_PAINEL = [
  { icon: TrendingUp, titulo: 'Receitas', desc: 'Quanto entrou durante o período.' },
  { icon: TrendingDown, titulo: 'Despesas', desc: 'Quanto foi gasto.' },
  { icon: DollarSign, titulo: 'Saldo', desc: 'Resultado entre receitas e despesas.' },
  { icon: Tag, titulo: 'Categorias', desc: 'Veja onde está concentrada a maior parte dos gastos.' },
  { icon: History, titulo: 'Histórico', desc: 'Consulte as movimentações registradas.' },
];

const FORMA_TRADICIONAL = [
  'Lembrar do gasto depois',
  'Abrir planilha ou sistema',
  'Preencher informações',
  'Organizar categorias',
];

const RESULTADOS = [
  'Entenda onde você mais gasta.',
  'Acompanhe seu saldo.',
  'Compare receitas e despesas.',
  'Tenha uma visão geral das finanças da casa.',
];

const PLANO_INCLUI = [
  'Lançamento de gastos e receitas pelo WhatsApp',
  'Categorização automática das movimentações',
  'Relatórios e histórico completos',
  'Painel com receitas, despesas e saldo',
  'Até 8 pessoas na mesma família',
];

const FAQ = [
  {
    p: 'O que é o RevelaCash?',
    r: 'O RevelaCash é uma plataforma de organização financeira pessoal e familiar. Você registra receitas e despesas pelo WhatsApp e acompanha as informações organizadas no painel.',
  },
  {
    p: 'Como registro uma despesa?',
    r: 'Envie uma mensagem pelo WhatsApp informando a movimentação. Por exemplo: "Gastei R$ 84,90 no mercado." O RevelaCash interpreta a mensagem e registra a despesa.',
  },
  {
    p: 'Também posso registrar receitas?',
    r: 'Sim. Você pode informar valores recebidos pelo WhatsApp para acompanhar receitas e despesas no mesmo controle.',
  },
  {
    p: 'Preciso usar o painel?',
    r: 'O WhatsApp é utilizado para facilitar o registro das movimentações. O painel do RevelaCash permite visualizar e acompanhar suas informações financeiras de forma organizada.',
  },
  {
    p: 'Posso usar com meu parceiro ou minha família?',
    r: 'Sim. O RevelaCash funciona individualmente ou com até 8 pessoas na mesma família, cada uma com seus lançamentos identificados pelo próprio número de WhatsApp.',
  },
  {
    p: 'Quanto custa?',
    r: 'O plano custa R$ 24,90 por mês por família, após o período gratuito de 7 dias. Você pode cancelar quando quiser, direto pelo painel.',
  },
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

  function irPara(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
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
              Começar grátis
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-0 overflow-hidden max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-revealcontent">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-dark bg-brand-light px-3 py-1 rounded-full">
              Finanças organizadas pelo WhatsApp
            </span>
            <h1 className="mt-5 text-3xl sm:text-5xl font-extrabold leading-tight tracking-tight">
              Descubra para onde<br />
              <span className="text-brand">seu dinheiro está indo.</span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-muted max-w-lg">
              Registre gastos e receitas pelo WhatsApp e acompanhe tudo organizado
              no RevelaCash. Veja quanto entrou, quanto saiu, onde você mais gastou
              e como está a sua vida financeira.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => abrirAuth('criar')}
                className="btn-primary justify-center flex items-center gap-2 py-3 px-6 text-base"
              >
                Começar grátis <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => irPara('como-funciona')}
                className="btn-secondary justify-center flex items-center gap-2 py-3 px-6 text-base"
              >
                Ver como funciona
              </button>
            </div>
            <p className="mt-4 text-xs text-faint">
              7 dias grátis • Depois, R$ 24,90/mês por família
            </p>
          </div>

          {/* Demonstração: mensagem no WhatsApp → registro → painel. Mesmos
              tokens/cores do Dashboard real, não é screenshot. */}
          <div className="animate-revealcontent" style={{ animationDelay: '0.12s' }}>
            <div className="rounded-2xl border border-border bg-white shadow-modal p-4 sm:p-5 space-y-4">
              <div className="space-y-2">
                <ChatBubbleOut texto="Gastei R$ 84,90 no mercado." />
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-income flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageCircle className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-surface-alt rounded-2xl rounded-tl-sm border border-border px-3.5 py-2 text-sm">
                    <p className="font-semibold text-ink">Despesa registrada</p>
                    <p className="text-brand-dark font-mono font-bold mt-0.5">R$ 84,90</p>
                    <p className="text-xs text-muted">Mercado</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <ArrowDown className="w-4 h-4 text-faint" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Painel financeiro</p>
                  <span className="text-[11px] text-faint">Agosto de 2026</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <MockKpi icon={TrendingUp} label="Receitas" value="R$ 8.400" color="#0d9488" />
                  <MockKpi icon={TrendingDown} label="Despesas" value="R$ 5.180" color="#dc2626" />
                  <MockKpi icon={DollarSign} label="Saldo" value="R$ 3.220" color="#2563eb" />
                  <MockKpi icon={Tag} label="Categorias" value="6" color="#512b8d" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Marca d'água decorativa — reforça a marca sem competir com o
            conteúdo. Atrás da coluna de texto (fundo claro), não atrás do
            card branco (ficaria encoberta). aria-hidden porque é só
            ilustração. */}
        <img
          src="/brand/icon-color-1024.webp"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute -z-10 top-1/2 left-0 w-[600px] max-w-[70vw] opacity-[0.10] -translate-y-1/2 -translate-x-1/4"
        />
      </section>

      {/* ── Como funciona ── */}
      <section id="como-funciona" className="bg-white border-y border-border py-16 sm:py-20 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center">
            Você envia a movimentação.<br className="hidden sm:block" /> O RevelaCash organiza.
          </h2>
          <p className="text-center text-muted mt-3 max-w-xl mx-auto">
            Registrar uma despesa ou receita pode ser tão simples quanto enviar uma mensagem.
          </p>
          <div className="mt-12 grid sm:grid-cols-3 gap-8">
            {PASSOS.map((p, i) => (
              <div key={p.n}>
                <div className="flex items-center gap-3">
                  <span className={`w-9 h-9 rounded-xl ${i === 1 ? 'bg-accent' : 'bg-brand'} text-white font-mono font-bold text-sm flex items-center justify-center flex-shrink-0`}>
                    {p.n}
                  </span>
                  <h3 className="font-bold text-lg">{p.title}</h3>
                </div>
                <p className="mt-3 text-sm text-muted">{p.desc}</p>
                <div className="mt-4">{p.visual}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Principal problema ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold leading-snug">
              O dinheiro vai saindo aos poucos. No fim do mês, fica difícil saber para onde ele foi.
            </h2>
            <p className="mt-4 text-muted">
              Mercado, combustível, delivery, assinaturas, contas e pequenas compras se
              acumulam durante o mês. O RevelaCash reúne essas movimentações para você
              enxergar seus gastos de forma organizada.
            </p>
          </div>
          <div className="card">
            <p className="text-xs font-bold uppercase tracking-wide text-muted mb-4">Despesas por categoria</p>
            <div className="space-y-3.5">
              {CATEGORIAS_EXEMPLO.map((c) => (
                <div key={c.nome}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-ink">{c.nome}</span>
                    <span className="font-mono text-muted">R$ {c.valor.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-alt overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${(c.valor / c.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-faint mt-4">Exemplo ilustrativo — não são dados de clientes reais.</p>
          </div>
        </div>
      </section>

      {/* ── Benefício principal ── */}
      <section className="bg-white border-y border-border py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center leading-snug">
            Não basta saber quanto você gastou.<br className="hidden sm:block" /> É importante saber onde gastou.
          </h2>
          <p className="text-center text-muted mt-3 max-w-xl mx-auto">
            O RevelaCash transforma suas movimentações em uma visão clara das suas finanças.
          </p>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
        </div>
      </section>

      {/* ── WhatsApp ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="order-2 lg:order-1 space-y-2">
            {MENSAGENS_EXEMPLO.map((m) => (
              <ChatBubbleOut key={m} texto={m} />
            ))}
          </div>
          <div className="order-1 lg:order-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold leading-snug">
              Registre seus gastos no momento em que eles acontecem.
            </h2>
            <p className="mt-4 text-muted">
              Em vez de deixar para lembrar depois, envie a movimentação pelo WhatsApp
              assim que fizer uma compra, pagar uma conta ou receber algum valor.
            </p>
            <p className="mt-4 text-muted">
              O RevelaCash transforma essas mensagens em movimentações organizadas no
              seu painel.
            </p>
          </div>
        </div>
      </section>

      {/* ── Individual, casal e família ── */}
      <section className="bg-white border-y border-border py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center max-w-2xl mx-auto leading-snug">
            Organize suas finanças sozinho ou junto com quem divide as contas com você.
          </h2>
          <div className="mt-12 grid sm:grid-cols-3 gap-6">
            {MODOS_DE_USO.map(({ icon: Icon, titulo, desc }, i) => (
              <div key={titulo} className="card text-center sm:text-left">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto sm:mx-0 ${i === 1 ? 'bg-accent-light' : 'bg-brand-light'}`}>
                  <Icon className={`w-5 h-5 ${i === 1 ? 'text-accent-dark' : 'text-brand-dark'}`} />
                </div>
                <h3 className="mt-3 font-bold">{titulo}</h3>
                <p className="mt-1.5 text-sm text-muted">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dashboard ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-center">Suas movimentações viram informação.</h2>
        <p className="text-center text-muted mt-3 max-w-xl mx-auto">
          O painel reúne os dados registrados para mostrar de forma simples como está
          sua situação financeira.
        </p>

        <div className="mt-12 grid lg:grid-cols-[1.3fr_1fr] gap-8 items-center">
          <div className="rounded-2xl border border-border bg-white shadow-card p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <MockKpi icon={TrendingUp} label="Receitas" value="R$ 8.400" color="#0d9488" />
              <MockKpi icon={TrendingDown} label="Despesas" value="R$ 5.180" color="#dc2626" />
              <MockKpi icon={DollarSign} label="Saldo" value="R$ 3.220" color="#2563eb" />
              <MockKpi icon={Tag} label="Categorias" value="6" color="#512b8d" />
            </div>
            <div className="rounded-xl border border-border bg-surface-alt p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-faint mb-2">Transações recentes</p>
              <div className="space-y-1.5">
                {[
                  { d: 'Mercado', v: '− R$ 84,90' },
                  { d: 'Salário', v: '+ R$ 3.500,00' },
                  { d: 'Internet', v: '− R$ 129,00' },
                ].map((t) => (
                  <div key={t.d} className="flex justify-between text-xs bg-white rounded-lg border border-border px-2.5 py-1.5">
                    <span className="text-ink">{t.d}</span>
                    <span className="font-mono text-muted">{t.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {CALLOUTS_PAINEL.map(({ icon: Icon, titulo, desc }) => (
              <div key={titulo} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-brand-dark" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{titulo}</p>
                  <p className="text-sm text-muted">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Diferencial ── */}
      <section className="bg-white border-y border-border py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center leading-snug">
            Menos esforço para registrar.<br className="hidden sm:block" /> Mais clareza para acompanhar.
          </h2>
          <div className="mt-12 grid sm:grid-cols-2 gap-6">
            <div className="card bg-surface-alt border-border">
              <p className="text-xs font-bold uppercase tracking-wide text-faint mb-4">Forma tradicional</p>
              <ul className="space-y-3">
                {FORMA_TRADICIONAL.map((t) => (
                  <li key={t} className="flex items-center gap-2.5 text-sm text-muted">
                    <X className="w-4 h-4 text-faint flex-shrink-0" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card border-brand-200">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-dark mb-4">RevelaCash</p>
              <ChatBubbleOut texto="Gastei R$ 45 no almoço." />
              <div className="flex items-center gap-2 mt-3 text-sm">
                <CheckCircle2 className="w-4 h-4 text-income flex-shrink-0" />
                <span className="font-medium">Despesa registrada.</span>
              </div>
              <p className="text-sm text-muted mt-3">Ela já aparece no seu controle financeiro.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Resultado ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-extrabold">Veja seu dinheiro de uma forma mais clara.</h2>
        <p className="mt-4 text-muted max-w-2xl mx-auto">
          Quando receitas e despesas estão organizadas, fica mais fácil identificar
          seus hábitos, perceber excessos e tomar decisões com mais informação.
        </p>
        <div className="mt-10 grid sm:grid-cols-2 gap-4 max-w-xl mx-auto text-left">
          {RESULTADOS.map((r) => (
            <div key={r} className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-income flex-shrink-0 mt-0.5" />
              <span className="text-sm">{r}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Preço ── */}
      <section id="preco" className="relative z-0 overflow-hidden bg-ink text-white py-16 sm:py-20 scroll-mt-16">
        <img
          src="/brand/icon-white-1024.webp"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute -z-0 -bottom-16 -left-16 w-[420px] max-w-[55vw] opacity-[0.05]"
        />
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold">Um único plano para organizar as finanças da sua casa.</h2>

          <div className="mt-8 bg-white text-ink rounded-2xl p-6 sm:p-8 shadow-modal">
            <p className="text-4xl sm:text-5xl font-extrabold">
              R$ 24,90<span className="text-lg font-medium text-muted">/mês</span>
            </p>
            <p className="text-sm text-muted mt-1">por família — até 8 integrantes</p>
            <p className="text-sm text-muted mt-4">
              Use o RevelaCash para registrar e acompanhar as movimentações financeiras da sua casa.
            </p>

            <ul className="mt-6 space-y-2.5 text-left max-w-xs mx-auto">
              {PLANO_INCLUI.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-income flex-shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => abrirAuth('criar')}
              className="btn-primary w-full justify-center flex items-center gap-2 py-3 mt-7 text-base"
            >
              Começar meus 7 dias grátis <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-xs text-faint mt-3">Sem cartão de crédito no cadastro. Cancele quando quiser.</p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="duvidas" className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 scroll-mt-16">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-center">Dúvidas frequentes</h2>
        <div className="mt-10 space-y-3">
          {FAQ.map(({ p, r }) => (
            <details key={p} className="group card">
              <summary className="flex items-center justify-between gap-3 cursor-pointer list-none font-semibold text-sm sm:text-base">
                {p}
                <ChevronDown className="w-4 h-4 text-faint flex-shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <p className="text-sm text-muted mt-3">{r}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-extrabold">Comece a entender para onde seu dinheiro está indo.</h2>
        <p className="mt-3 text-muted">
          Registre suas próximas movimentações pelo WhatsApp e acompanhe tudo organizado no RevelaCash.
        </p>
        <button
          type="button"
          onClick={() => abrirAuth('criar')}
          className="btn-primary inline-flex items-center gap-2 py-3 px-7 text-base mt-7"
        >
          Começar grátis <ArrowRight className="w-4 h-4" />
        </button>
        <p className="text-xs text-faint mt-3">7 dias grátis</p>
      </section>

      {/* ── Entrar / criar conta — modal inline, sem sair da landing ── */}
      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="max-w-md">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <Logo size="lg" withWordmark={false} />
            </div>
            <DialogTitle className="text-xl font-bold">
              <span className="text-brand">Revela</span><span className="text-accent">Cash</span>
            </DialogTitle>
            <p className="text-sm text-muted mt-1">Organização financeira pelo WhatsApp</p>
          </div>
          <AuthForm initialAba={authAba} />
        </DialogContent>
      </Dialog>

      {/* ── Rodapé ── */}
      <footer className="border-t border-border bg-white py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-8">
            <div>
              <Logo size="sm" />
              <p className="text-sm text-muted mt-3 max-w-xs">
                Organização financeira pessoal e familiar pelo WhatsApp.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <button type="button" onClick={() => irPara('como-funciona')} className="text-muted hover:text-ink">Como funciona</button>
              <button type="button" onClick={() => irPara('preco')} className="text-muted hover:text-ink">Preço</button>
              <button type="button" onClick={() => irPara('duvidas')} className="text-muted hover:text-ink">Dúvidas</button>
              <button type="button" onClick={() => abrirAuth('entrar')} className="text-muted hover:text-ink">Entrar</button>
              <Link to="/termos" className="text-muted hover:text-ink">Termos de Uso</Link>
              <Link to="/privacidade" className="text-muted hover:text-ink">Política de Privacidade</Link>
              <a href="https://instagram.com/revelacash" target="_blank" rel="noreferrer" className="text-muted hover:text-ink">Contato</a>
            </nav>
          </div>
          <p className="text-xs text-faint mt-8 pt-6 border-t border-border">
            LION TECH SOLUÇÕES EM TI LTDA · CNPJ 44.124.574/0001-47 · Mineiros-GO
          </p>
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

/** Bolha de mensagem enviada pelo usuário no WhatsApp — só o lado de fora (saída). */
function ChatBubbleOut({ texto }) {
  return (
    <div className="flex justify-end">
      <div className="bg-brand text-white rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm max-w-[85%]">
        {texto}
      </div>
    </div>
  );
}

/** Cartão de movimentação já registrada, como aparece no painel. */
function MovimentacaoCard({ tipo, valor, categoria, quando }) {
  return (
    <div className="rounded-xl border border-border bg-white p-3 text-sm">
      <div className="flex justify-between">
        <span className="font-semibold text-ink">{tipo}</span>
        <span className="font-mono font-bold text-expense">{valor}</span>
      </div>
      <p className="text-xs text-muted mt-0.5">{categoria} · {quando}</p>
    </div>
  );
}
