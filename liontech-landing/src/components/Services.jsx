import {
  Monitor,
  Laptop,
  Smartphone,
  HardDrive,
  Gauge,
  Sparkles,
  Fan,
  Thermometer,
  MemoryStick,
  ShieldCheck,
  Download,
  Gamepad2,
  ShoppingBag,
} from 'lucide-react'
import { whatsappLink, WHATSAPP_MESSAGES } from '../config.js'
import SectionHeader from './ui/SectionHeader.jsx'
import Reveal from './ui/Reveal.jsx'

const SERVICES = [
  { Icon: Monitor, title: 'Manutenção de computadores', desc: 'Diagnóstico e reparo completo do seu desktop, do hardware ao sistema.' },
  { Icon: Laptop, title: 'Manutenção de notebooks', desc: 'Reparo de notebooks de todas as marcas, com cuidado e agilidade.' },
  { Icon: Smartphone, title: 'Assistência para celulares', desc: 'Atendimento técnico para o seu smartphone voltar a funcionar como novo.' },
  { Icon: HardDrive, title: 'Formatação com ou sem backup', desc: 'Sistema reinstalado do zero, com opção de preservar seus arquivos.' },
  { Icon: Gauge, title: 'Otimização de sistema', desc: 'Seu equipamento mais rápido, sem travamentos e sem lentidão.' },
  { Icon: Sparkles, title: 'Limpeza preventiva', desc: 'Remoção de poeira interna para evitar superaquecimento e defeitos.' },
  { Icon: Fan, title: 'Limpeza de PC gamer', desc: 'Limpeza completa da sua máquina gamer, coolers, filtros e gabinete.' },
  { Icon: Thermometer, title: 'Troca de pasta térmica', desc: 'Temperaturas controladas para melhor desempenho e vida útil.' },
  { Icon: MemoryStick, title: 'Upgrade de SSD e memória RAM', desc: 'Mais velocidade e capacidade com upgrades sob medida.' },
  { Icon: ShieldCheck, title: 'Remoção de vírus', desc: 'Limpeza de vírus e ameaças, com o sistema protegido de novo.' },
  { Icon: Download, title: 'Instalação de programas', desc: 'Programas e drivers instalados e configurados do jeito certo.' },
  { Icon: Gamepad2, title: 'Montagem e upgrade de PC gamer', desc: 'Montamos ou evoluímos seu setup gamer com as peças ideais.' },
  { Icon: ShoppingBag, title: 'Venda de acessórios e eletrônicos', desc: 'Celulares, periféricos, acessórios e produtos de informática.' },
]

export default function Services() {
  return (
    <section id="servicos" className="relative py-20 sm:py-28">
      {/* brilho de fundo */}
      <div className="absolute left-0 top-1/3 h-[360px] w-[420px] rounded-full bg-neon-purple/10 blur-[130px]" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          kicker="Serviços"
          title="Tudo o que sua tecnologia precisa"
          description="Da manutenção completa ao upgrade do seu PC gamer: a Lion Tech resolve com diagnóstico profissional e orçamento transparente."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {SERVICES.map(({ Icon, title, desc }, i) => (
            <Reveal key={title} delay={(i % 4) * 0.07}>
              <div
                className="glass-card group flex h-full flex-col gap-3 p-6 transition-all duration-300
                  hover:-translate-y-1 hover:border-neon-blue/40 hover:shadow-neon-blue"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-neon-blue/10 text-neon-blue transition-colors group-hover:bg-neon-blue/20">
                  <Icon size={22} />
                </span>
                <h3 className="font-display text-base font-semibold text-white">{title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{desc}</p>
              </div>
            </Reveal>
          ))}

          {/* Card CTA fechando a grade */}
          <Reveal delay={0.14}>
            <a
              href={whatsappLink(WHATSAPP_MESSAGES.orcamento)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex h-full flex-col items-center justify-center gap-3 rounded-2xl border
                border-neon-purple/50 bg-gradient-to-br from-neon-purple/20 to-neon-blue/15 p-6 text-center
                transition-all duration-300 hover:-translate-y-1 hover:shadow-neon-purple"
            >
              <span className="font-display text-lg font-bold text-white">Não achou o que precisa?</span>
              <span className="text-sm text-slate-300">Fale com a gente e descreva o problema.</span>
              <span className="mt-1 font-display text-sm font-semibold text-neon-cyan group-hover:underline">
                Chamar no WhatsApp →
              </span>
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
