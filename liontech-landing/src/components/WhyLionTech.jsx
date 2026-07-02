import { MapPin, Store, Stethoscope, Receipt, HeartHandshake, Zap, Cpu, LifeBuoy } from 'lucide-react'
import SectionHeader from './ui/SectionHeader.jsx'
import Reveal from './ui/Reveal.jsx'

const REASONS = [
  { Icon: MapPin, title: 'Atendimento local em Mineiros-GO', desc: 'Sem enviar seu equipamento para outra cidade: resolvemos aqui mesmo.' },
  { Icon: Store, title: 'Loja física no Centro', desc: 'Um endereço real para você visitar, conversar e acompanhar o serviço.' },
  { Icon: Stethoscope, title: 'Diagnóstico profissional', desc: 'Identificamos a causa real do problema antes de qualquer reparo.' },
  { Icon: Receipt, title: 'Orçamento transparente', desc: 'Você sabe exatamente o que será feito e quanto vai custar.' },
  { Icon: HeartHandshake, title: 'Atendimento humanizado', desc: 'Explicamos tudo em linguagem simples, sem tecniquês.' },
  { Icon: Zap, title: 'Agilidade', desc: 'Atendimento rápido para você ficar o mínimo possível sem seu equipamento.' },
  { Icon: Cpu, title: 'Experiência com tudo que é tech', desc: 'Computadores, notebooks, celulares e PC gamer: a gente domina.' },
  { Icon: LifeBuoy, title: 'Suporte antes e depois', desc: 'Ficou com dúvida depois do serviço? Continuamos por perto.' },
]

export default function WhyLionTech() {
  return (
    <section id="por-que" className="relative py-20 sm:py-28">
      <div className="absolute left-1/4 top-0 h-[320px] w-[420px] rounded-full bg-neon-purple/10 blur-[130px]" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          kicker="Diferenciais"
          title="Por que escolher a Lion Tech?"
          description="Uma loja de informática e assistência técnica completa, do jeito que Mineiros merece."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REASONS.map(({ Icon, title, desc }, i) => (
            <Reveal key={title} delay={(i % 4) * 0.08}>
              <div className="glass-card group h-full p-6 transition-all duration-300 hover:-translate-y-1 hover:border-neon-purple/40 hover:shadow-neon-purple">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-neon-purple/15 text-neon-violet transition-colors group-hover:bg-neon-purple/25">
                  <Icon size={22} />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
