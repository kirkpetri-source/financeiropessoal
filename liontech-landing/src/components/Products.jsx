import { Smartphone, Headphones, Gamepad2, Cable, Tv, Mouse, CircuitBoard, MessageCircle } from 'lucide-react'
import { whatsappLink, WHATSAPP_MESSAGES } from '../config.js'
import SectionHeader from './ui/SectionHeader.jsx'
import Reveal from './ui/Reveal.jsx'

const CATEGORIES = [
  { Icon: Smartphone, title: 'Celulares', desc: 'Smartphones para todos os perfis e bolsos.' },
  { Icon: Headphones, title: 'Acessórios', desc: 'Fones, capas, películas, suportes e muito mais.' },
  { Icon: Gamepad2, title: 'Periféricos gamer', desc: 'Teclados, mouses, headsets e mousepads para o seu setup.' },
  { Icon: Cable, title: 'Cabos e carregadores', desc: 'Carregadores, cabos e adaptadores de qualidade.' },
  { Icon: Tv, title: 'Eletrônicos', desc: 'Caixas de som, smart TV box e eletrônicos em geral.' },
  { Icon: Mouse, title: 'Produtos de informática', desc: 'Tudo para o seu computador e escritório.' },
  { Icon: CircuitBoard, title: 'Peças para upgrade', desc: 'SSD, memória RAM, fontes e componentes.' },
]

export default function Products() {
  return (
    <section id="produtos" className="relative py-20 sm:py-28">
      <div className="absolute right-1/4 top-1/4 h-[320px] w-[420px] rounded-full bg-neon-blue/10 blur-[130px]" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          kicker="Loja Lion Tech"
          title="Muito além da assistência: uma loja completa"
          description="A Lion Tech também vende celulares, eletrônicos, periféricos e peças. Consulte a disponibilidade direto pelo WhatsApp."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map(({ Icon, title, desc }, i) => (
            <Reveal key={title} delay={(i % 4) * 0.08}>
              <div className="glass-card group h-full p-6 transition-all duration-300 hover:-translate-y-1 hover:border-neon-blue/40 hover:shadow-neon-blue">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-neon-purple/20 to-neon-blue/20 text-neon-cyan">
                  <Icon size={22} />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{desc}</p>
              </div>
            </Reveal>
          ))}

          <Reveal delay={0.24}>
            <a
              href={whatsappLink(WHATSAPP_MESSAGES.produtos)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex h-full flex-col justify-center gap-3 rounded-2xl border border-neon-blue/50
                bg-gradient-to-br from-neon-blue/15 to-neon-purple/15 p-6 transition-all duration-300
                hover:-translate-y-1 hover:shadow-neon-blue"
            >
              <MessageCircle size={24} className="text-neon-cyan" />
              <span className="font-display text-lg font-bold text-white">Procurando algum produto?</span>
              <span className="text-sm text-slate-300">Consulte a disponibilidade e preços pelo WhatsApp.</span>
              <span className="font-display text-sm font-semibold text-neon-cyan group-hover:underline">Consultar agora →</span>
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
