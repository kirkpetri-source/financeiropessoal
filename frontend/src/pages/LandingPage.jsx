import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Users, User, Home, Eye, ArrowLeftRight, History, FileBarChart,
  ArrowRight, CheckCircle2, X, ChevronDown,
  TrendingUp, TrendingDown, DollarSign, Tag,
  Keyboard, Mic, Camera, ShieldCheck, Clock, Undo2, Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../components/brand/Logo';
import AuthForm from '../components/auth/AuthForm';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';

/**
 * Landing page de vendas.
 *
 * Reescrita completa (08/08/2026): identidade visual definitiva (logo +
 * fotos de produto) e os dois recursos novos (áudio e foto de cupom via IA)
 * viraram o eixo da página — é a maior diferença prática do produto hoje.
 *
 * Continua a mesma regra da reescrita de conteúdo anterior: nenhuma
 * funcionalidade citada é inventada, nenhum número de cliente/depoimento é
 * fabricado. As fotos em public/brand/marketing/ são material de produto
 * (mockups do próprio app), não depoimento de cliente — por isso não têm
 * nome nem citação atribuída a ninguém.
 */

const RECURSOS_LANCAMENTO = [
  {
    icon: Keyboard,
    titulo: 'Digite do seu jeito',
    desc: 'Escreva a mensagem como você já fala no dia a dia. Sem formulário, sem campo obrigatório.',
    exemplo: 'gastei 84,90 no mercado',
  },
  {
    icon: Mic,
    titulo: 'Grave um áudio',
    desc: 'Sem largar o que está fazendo. Fale o gasto — o RevelaCash transcreve e organiza sozinho.',
    exemplo: '"gastei 45 reais no almoço"',
  },
  {
    icon: Camera,
    titulo: 'Fotografe o cupom',
    desc: 'Tirou a nota fiscal do bolso? Manda a foto. Uma IA lê o valor e o estabelecimento por você.',
    exemplo: 'foto do cupom fiscal',
  },
];

const BENEFICIOS = [
  { icon: Eye, title: 'Visão dos gastos', desc: 'Veja quais categorias estão consumindo mais dinheiro durante o mês.' },
  { icon: ArrowLeftRight, title: 'Receitas e despesas', desc: 'Acompanhe quanto entrou, quanto saiu e qual é o seu saldo.' },
  { icon: History, title: 'Histórico', desc: 'Consulte suas movimentações sem depender da memória ou de anotações espalhadas.' },
  { icon: FileBarChart, title: 'Relatórios', desc: 'Visualize seus dados de forma organizada para entender melhor seus hábitos financeiros.' },
];

const CATEGORIAS_EXEMPLO = [
  { nome: 'Mercado', valor: 1240, max: 1240 },
  { nome: 'Alimentação', valor: 680, max: 1240 },
  { nome: 'Combustível', valor: 520, max: 1240 },
  { nome: 'Assinaturas', valor: 189, max: 1240 },
];

const MODOS_DE_USO = [
  { icon: User, titulo: 'Individual', desc: 'Registre suas receitas e despesas e acompanhe sua própria vida financeira.' },
  { icon: Users, titulo: 'Casal', desc: 'Centralize as movimentações da casa para que os dois tenham uma visão mais clara das finanças.' },
  { icon: Home, titulo: 'Família', desc: 'Reúna os lançamentos dos participantes e acompanhe as despesas familiares em um único lugar, com até 8 pessoas.' },
];

const CALLOUTS_PAINEL = [
  { icon: TrendingUp, titulo: 'Receitas', desc: 'Quanto entrou durante o período.' },
  { icon: TrendingDown, titulo: 'Despesas', desc: 'Quanto foi gasto.' },
  { icon: DollarSign, titulo: 'Saldo', desc: 'Resultado entre receitas e despesas.' },
  { icon: Tag, titulo: 'Categorias', desc: 'Veja onde está concentrada a maior parte dos gastos.' },
];

const FORMA_TRADICIONAL = [
  'Lembrar do gasto depois',
  'Abrir planilha ou app novo',
  'Preencher formulário',
  'Organizar categoria na mão',
];

const RESULTADOS = [
  'Entenda onde você mais gasta.',
  'Acompanhe seu saldo em tempo real.',
  'Compare receitas e despesas do mês.',
  'Tenha uma visão geral das finanças da casa.',
];

const PLANO_INCLUI = [
  'Lançamento por texto, áudio ou foto do cupom',
  'Categorização automática das movimentações',
  'Relatórios e histórico completos',
  'Painel com receitas, despesas e saldo',
  'Até 8 pessoas na mesma família',
];

const CONFIANCA = [
  { icon: Clock, titulo: '7 dias grátis', desc: 'Sem cartão de crédito no cadastro.' },
  { icon: Undo2, titulo: 'Cancele quando quiser', desc: 'Direto pelo painel, sem burocracia.' },
  { icon: ShieldCheck, titulo: 'Dados protegidos', desc: 'Exportação e exclusão sob seu controle.' },
];

const FAQ = [
  {
    p: 'O que é o RevelaCash?',
    r: 'O RevelaCash é uma plataforma de organização financeira pessoal e familiar. Você registra receitas e despesas pelo WhatsApp — digitando, falando ou fotografando — e acompanha tudo organizado no painel.',
  },
  {
    p: 'Como funciona o lançamento por áudio ou foto?',
    r: 'Grave um áudio contando o gasto ou envie a foto do cupom fiscal. Uma inteligência artificial lê o conteúdo, identifica valor, categoria e estabelecimento, e registra a movimentação automaticamente — do mesmo jeito que se você tivesse digitado.',
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
    p: 'Meus dados financeiros ficam seguros?',
    r: 'Sim. O acesso é protegido por login individual e cada família só enxerga os próprios dados. Você pode exportar ou pedir a exclusão completa das suas informações a qualquer momento — veja os detalhes na Política de Privacidade.',
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
    <div className="min-h-screen bg-bg text-ink overflow-x-hidden">
      {/* ── Nav ── */}
      <header className="border-b border-border bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo size="sm" />
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted">
            <button type="button" onClick={() => irPara('como-funciona')} className="hover:text-ink">Como funciona</button>
            <button type="button" onClick={() => irPara('preco')} className="hover:text-ink">Preço</button>
            <button type="button" onClick={() => irPara('duvidas')} className="hover:text-ink">Dúvidas</button>
          </nav>
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
        {/* Atmosfera de fundo — blobs de gradiente na cor da marca, técnica comum
            em landing pages premium (Stripe/Linear) pra dar profundidade sem
            competir com o conteúdo. */}
        <div aria-hidden="true" className="pointer-events-none absolute -z-10 inset-0">
          <div className="absolute top-10 -left-28 w-[420px] h-[420px] rounded-full bg-brand/20 blur-[110px]" />
          <div className="absolute top-1/3 -right-28 w-[380px] h-[380px] rounded-full bg-accent/20 blur-[100px]" />
        </div>

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="animate-revealcontent">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-dark bg-brand-light px-3 py-1 rounded-full">
              <Sparkles className="w-3.5 h-3.5" /> Novo: lance por voz ou foto do cupom
            </span>
            <h1 className="mt-5 text-3xl sm:text-5xl font-extrabold leading-tight tracking-tight">
              Pare de se perguntar<br />
              <span className="text-brand">pra onde foi seu dinheiro.</span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-muted max-w-lg">
              Manda um áudio, uma foto do cupom ou só digita no WhatsApp. O
              RevelaCash entende a mensagem sozinho e organiza tudo no seu
              painel — sem planilha, sem app novo pra aprender.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => abrirAuth('criar')}
                className="btn-primary justify-center flex items-center gap-2 py-3 px-6 text-base"
              >
                Começar grátis por 7 dias <ArrowRight className="w-4 h-4" />
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
              Sem cartão de crédito no cadastro · Cancele quando quiser
            </p>
          </div>

          <div className="animate-revealcontent" style={{ animationDelay: '0.12s' }}>
            <div className="relative">
              {/* Ícone da marca em tamanho real, saindo de trás da foto — não mais
                  escondido numa marca d'água quase invisível. Vem primeiro no DOM
                  (sem z-index negativo) para que a foto, logo depois, pinte por cima. */}
              <img
                src="/brand/icon-color-1024.webp"
                alt=""
                aria-hidden="true"
                className="pointer-events-none select-none absolute -top-9 -right-5 sm:-top-12 sm:-right-9 w-32 sm:w-44 opacity-95 drop-shadow-2xl rotate-6"
              />
              <img
                src="/brand/marketing/hero-mesa-caos.webp"
                alt="Pessoa consultando o painel financeiro do RevelaCash no celular, com contas e comprovantes espalhados na mesa"
                width={1600}
                height={900}
                className="relative w-full h-auto rounded-2xl shadow-modal object-cover border border-border"
              />
              <div className="absolute -bottom-5 -left-4 sm:-bottom-6 sm:-left-6 bg-white rounded-2xl shadow-modal border border-border px-4 py-3 flex items-center gap-3 max-w-[240px]">
                <div className="w-9 h-9 rounded-full bg-income-light flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-income-dark" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink leading-tight">Lançado por foto</p>
                  <p className="text-sm font-mono font-bold text-brand-dark leading-tight">R$ 84,90</p>
                  <p className="text-[11px] text-muted leading-tight">Mercado</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── O problema ── */}
      <section className="bg-white border-y border-border py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold leading-snug">
                Mercado, posto, boleto, um pix aqui, outro ali...
              </h2>
              <p className="mt-4 text-muted">
                No fim do mês quase ninguém lembra exatamente pra onde foi o
                dinheiro. Sem controle, fica difícil saber se dá pra gastar
                menos, guardar mais, ou só entender o que aconteceu com o
                salário.
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
        </div>
      </section>

      {/* ── Três jeitos de lançar ── */}
      <section id="como-funciona" className="py-16 sm:py-20 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center">
            Três jeitos de lançar. Você escolhe o mais fácil na hora.
          </h2>
          <p className="text-center text-muted mt-3 max-w-xl mx-auto">
            Digitando, falando ou fotografando — tudo cai no mesmo painel, organizado automaticamente.
          </p>

          {/* Bento grid: um mosaico só, a tela real do WhatsApp e a cena do posto
              como blocos grandes, os 3 jeitos de lançar como blocos menores ao
              redor — mesmo padrão usado pelas SaaS de maior conversão hoje. */}
          <div className="mt-12 grid grid-cols-1 lg:grid-cols-6 gap-5">
            <div className="lg:col-span-2 lg:row-span-2 relative rounded-3xl overflow-hidden border border-border shadow-card min-h-[320px]">
              <img
                src="/brand/marketing/chat-recursos-ia.webp"
                alt="Conversa no WhatsApp mostrando o RevelaCash registrando uma despesa a partir da foto de um cupom fiscal e de um áudio"
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>

            {RECURSOS_LANCAMENTO.map(({ icon: Icon, titulo, desc, exemplo }, i) => (
              <div key={titulo} className="card lg:col-span-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${i === 1 ? 'bg-accent-light' : 'bg-brand-light'}`}>
                  <Icon className={`w-5 h-5 ${i === 1 ? 'text-accent-dark' : 'text-brand-dark'}`} />
                </div>
                <h3 className="mt-3 font-bold">{titulo}</h3>
                <p className="mt-1.5 text-sm text-muted">{desc}</p>
                <p className="mt-3 text-xs font-mono bg-surface-alt border border-border rounded-lg px-2.5 py-1.5 text-muted italic">
                  {exemplo}
                </p>
              </div>
            ))}

            {/* Cena real: ela está PARADA no posto abastecendo, não dirigindo —
                a legenda deixa isso explícito de propósito (não dá pra sugerir
                uso de celular em movimento). */}
            <div className="lg:col-span-2 relative rounded-3xl overflow-hidden border border-border shadow-card min-h-[240px]">
              <img
                src="/brand/marketing/audio-carro.webp"
                alt="Mulher parada no carro, no posto de gasolina, gravando um áudio no celular para lançar um gasto no RevelaCash"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/15 to-transparent" />
              <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 bg-white/95 backdrop-blur rounded-full px-3 py-1.5 shadow-card">
                <Mic className="w-3.5 h-3.5 text-accent-dark flex-shrink-0" />
                <span className="text-xs font-mono font-semibold text-ink">Combustível</span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                <p className="font-bold text-lg leading-snug">Direto do posto, sem digitar nada.</p>
                <p className="text-sm text-white/75 mt-1.5">
                  Parada pra abastecer, ela grava um áudio contando o gasto — o
                  RevelaCash organiza sozinho, sem precisar abrir o painel depois.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 grid sm:grid-cols-3 gap-6">
            <div className="flex items-start gap-2.5 text-sm">
              <CheckCircle2 className="w-4 h-4 text-income flex-shrink-0 mt-0.5" />
              Confirmação imediata, sem precisar abrir o painel
            </div>
            <div className="flex items-start gap-2.5 text-sm">
              <CheckCircle2 className="w-4 h-4 text-income flex-shrink-0 mt-0.5" />
              Reconhece o valor total mesmo em cupons longos
            </div>
            <div className="flex items-start gap-2.5 text-sm">
              <CheckCircle2 className="w-4 h-4 text-income flex-shrink-0 mt-0.5" />
              Funciona em português falado, do seu jeito
            </div>
          </div>
        </div>
      </section>

      {/* ── Marca ── */}
      <section className="relative z-0 overflow-hidden bg-white py-16 sm:py-20 text-center">
        <div aria-hidden="true" className="pointer-events-none absolute -z-10 inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-brand/10 blur-[120px]" />
        </div>
        <img
          src="/brand/icon-color-1024.webp"
          alt="Ícone do RevelaCash"
          className="mx-auto w-24 sm:w-32 drop-shadow-xl"
        />
        <h2 className="mt-6 text-2xl sm:text-3xl font-extrabold max-w-xl mx-auto leading-snug">
          Conversa de um lado. Clareza financeira do outro.
        </h2>
        <p className="mt-3 text-muted max-w-md mx-auto">
          É exatamente isso que o RevelaCash faz, mensagem após mensagem — sem
          você precisar organizar nada por conta própria.
        </p>
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

      {/* ── Individual, casal e família ── */}
      <section className="py-16 sm:py-20">
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

      {/* ── Painel ── */}
      <section className="bg-white border-y border-border py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center">Suas movimentações viram informação.</h2>
          <p className="text-center text-muted mt-3 max-w-xl mx-auto">
            O painel reúne os dados registrados para mostrar de forma simples como está sua situação financeira.
          </p>

          <div className="mt-12 grid lg:grid-cols-[1fr_1.1fr] gap-10 items-center">
            <div className="order-2 lg:order-1 space-y-4">
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
            <div className="order-1 lg:order-2 relative">
              <img
                src="/brand/marketing/homem-dashboard.webp"
                alt="Homem sorrindo mostrando o painel financeiro do RevelaCash no celular"
                width={1400}
                height={788}
                loading="lazy"
                className="w-full h-auto rounded-2xl shadow-modal border border-border"
              />
              <div className="absolute -bottom-4 -right-4 sm:-bottom-5 sm:-right-5 bg-white rounded-2xl shadow-modal border border-border px-4 py-3 flex items-center gap-3 max-w-[200px]">
                <div className="w-9 h-9 rounded-full bg-balance-light flex items-center justify-center flex-shrink-0">
                  <DollarSign className="w-5 h-5 text-balance-dark" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink leading-tight">Saldo do mês</p>
                  <p className="text-sm font-mono font-bold text-balance-dark leading-tight">R$ 3.220,00</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Diferencial ── */}
      <section className="py-16 sm:py-20">
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
      <section className="bg-white border-y border-border py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="relative order-2 lg:order-1">
              <img
                src="/brand/marketing/executiva-tablet.webp"
                alt="Mulher analisando informações organizadas em um tablet"
                width={1400}
                height={788}
                loading="lazy"
                className="w-full h-auto rounded-2xl shadow-modal border border-border"
              />
              <div className="absolute -top-4 -left-4 sm:-top-5 sm:-left-5 bg-white rounded-2xl shadow-modal border border-border px-4 py-3 flex items-center gap-3 max-w-[220px]">
                <div className="w-9 h-9 rounded-full bg-brand-light flex items-center justify-center flex-shrink-0">
                  <Tag className="w-5 h-5 text-brand-dark" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink leading-tight">Maior gasto do mês</p>
                  <p className="text-sm font-bold text-brand-dark leading-tight">Moradia</p>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold leading-snug">
                Informação organizada muda a forma como você decide.
              </h2>
              <p className="mt-4 text-muted">
                Quando receitas e despesas estão organizadas, fica mais fácil
                identificar seus hábitos, perceber excessos e tomar decisões
                com mais informação.
              </p>
              <div className="mt-6 grid gap-3">
                {RESULTADOS.map((r) => (
                  <div key={r} className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-income flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Preço ── */}
      <section id="preco" className="relative z-0 overflow-hidden bg-ink text-white py-16 sm:py-20 scroll-mt-16">
        <img
          src="/brand/icon-white-1024.webp"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute -z-0 -bottom-16 -right-16 w-[480px] max-w-[60vw] opacity-[0.08]"
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

          <div className="mt-10 grid sm:grid-cols-3 gap-4 text-left">
            {CONFIANCA.map(({ icon: Icon, titulo, desc }) => (
              <div key={titulo} className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{titulo}</p>
                  <p className="text-xs text-white/60">{desc}</p>
                </div>
              </div>
            ))}
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
        <img
          src="/brand/icon-color-1024.webp"
          alt=""
          aria-hidden="true"
          className="mx-auto w-14 sm:w-16 mb-5 drop-shadow-lg"
        />
        <h2 className="text-2xl sm:text-3xl font-extrabold">Comece a entender para onde seu dinheiro está indo.</h2>
        <p className="mt-3 text-muted">
          Digite, fale ou fotografe a próxima movimentação no WhatsApp e acompanhe tudo organizado no RevelaCash.
        </p>
        <button
          type="button"
          onClick={() => abrirAuth('criar')}
          className="btn-primary inline-flex items-center gap-2 py-3 px-7 text-base mt-7"
        >
          Começar grátis <ArrowRight className="w-4 h-4" />
        </button>
        <p className="text-xs text-faint mt-3">7 dias grátis · sem cartão de crédito</p>
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
