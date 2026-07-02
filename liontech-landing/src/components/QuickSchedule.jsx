import { Wrench, Calculator, Headset, Camera } from 'lucide-react'
import { whatsappLink, WHATSAPP_MESSAGES } from '../config.js'
import SectionHeader from './ui/SectionHeader.jsx'
import Reveal from './ui/Reveal.jsx'

// Cada botão abre o WhatsApp com uma mensagem diferente (editável em src/config.js)
const ACTIONS = [
  { Icon: Wrench, label: 'Agendar manutenção', message: WHATSAPP_MESSAGES.agendar },
  { Icon: Calculator, label: 'Solicitar orçamento', message: WHATSAPP_MESSAGES.orcamento },
  { Icon: Headset, label: 'Falar com técnico', message: WHATSAPP_MESSAGES.tecnico },
  { Icon: Camera, label: 'Enviar foto do problema', message: WHATSAPP_MESSAGES.foto },
]

export default function QuickSchedule() {
  return (
    <section id="agendamento" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          kicker="Atendimento rápido"
          title="Agende seu atendimento com a Lion Tech"
          description="Escolha o que você precisa e fale direto com a nossa equipe pelo WhatsApp — a mensagem já vai pronta."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ACTIONS.map(({ Icon, label, message }, i) => (
            <Reveal key={label} delay={i * 0.08}>
              <a
                href={whatsappLink(message)}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-card group flex h-full flex-col items-center gap-4 px-6 py-8 text-center
                  transition-all duration-300 hover:-translate-y-1 hover:border-neon-purple/50 hover:shadow-neon-purple"
              >
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br
                    from-neon-purple/25 to-neon-blue/25 text-neon-violet transition-colors group-hover:text-neon-cyan"
                >
                  <Icon size={26} />
                </span>
                <span className="font-display font-semibold text-white">{label}</span>
                <span className="text-xs text-slate-500">Abre o WhatsApp com mensagem pronta</span>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
