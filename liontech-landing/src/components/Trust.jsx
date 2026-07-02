import { BadgeCheck, Lock, MessagesSquare, ThumbsUp } from 'lucide-react'
import SectionHeader from './ui/SectionHeader.jsx'
import Reveal from './ui/Reveal.jsx'

const PILLARS = [
  {
    Icon: BadgeCheck,
    title: 'Atendimento técnico de verdade',
    desc: 'Nada de soluções improvisadas: diagnóstico sério feito por quem trabalha com tecnologia todos os dias.',
  },
  {
    Icon: Lock,
    title: 'Cuidado com seus dados',
    desc: 'Seus arquivos, fotos e senhas são tratados com responsabilidade e privacidade durante todo o serviço.',
  },
  {
    Icon: MessagesSquare,
    title: 'Serviço explicado de forma clara',
    desc: 'Você entende o que aconteceu com o equipamento e o que será feito, em linguagem simples.',
  },
  {
    Icon: ThumbsUp,
    title: 'Você aprova antes de executar',
    desc: 'Nenhum reparo é feito sem o seu OK no orçamento. Sem surpresas na hora de retirar.',
  },
]

export default function Trust() {
  return (
    <section id="confianca" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="glass-card relative overflow-hidden p-8 sm:p-12">
          {/* brilho interno */}
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-neon-purple/20 blur-[100px]" aria-hidden="true" />
          <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-neon-blue/15 blur-[100px]" aria-hidden="true" />

          <div className="relative">
            <SectionHeader
              kicker="Confiança"
              title="Seu equipamento em boas mãos"
              description="Transparência do início ao fim — porque confiança se constrói em cada atendimento."
            />

            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {PILLARS.map(({ Icon, title, desc }, i) => (
                <Reveal key={title} delay={i * 0.1}>
                  <div className="flex gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan">
                      <Icon size={24} />
                    </span>
                    <div>
                      <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
