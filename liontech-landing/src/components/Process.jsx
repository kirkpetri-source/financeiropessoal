import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { MessageCircle, CalendarCheck, Search, FileText, Wrench, PackageCheck } from 'lucide-react'
import { whatsappLink, WHATSAPP_MESSAGES } from '../config.js'
import SectionHeader from './ui/SectionHeader.jsx'

const STEPS = [
  { Icon: MessageCircle, title: 'Você entra em contato pelo WhatsApp', desc: 'Conte o que está acontecendo — pode até mandar uma foto do problema.' },
  { Icon: CalendarCheck, title: 'Agenda ou leva o equipamento até a loja', desc: 'Escolha o melhor horário ou passe na loja no Centro de Mineiros.' },
  { Icon: Search, title: 'A equipe faz o diagnóstico', desc: 'Analisamos o equipamento e identificamos a causa real do problema.' },
  { Icon: FileText, title: 'Você recebe o orçamento', desc: 'Valores claros e explicação do que será feito. Nada é executado sem a sua aprovação.' },
  { Icon: Wrench, title: 'O serviço é executado', desc: 'Reparo, limpeza ou upgrade feitos com cuidado e peças adequadas.' },
  { Icon: PackageCheck, title: 'Você retira seu equipamento pronto', desc: 'Testado, funcionando e com tudo explicado na entrega.' },
]

/**
 * Linha do tempo com scroll trigger: a linha central "preenche"
 * conforme o usuário rola, e cada etapa surge da lateral.
 */
export default function Process() {
  const trackRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start 75%', 'end 65%'],
  })
  const lineScale = useTransform(scrollYProgress, [0, 1], [0, 1])

  return (
    <section id="processo" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          kicker="Como funciona"
          title="Do problema à solução em 6 passos"
          description="Um processo simples e transparente, do primeiro contato à entrega do seu equipamento."
        />

        <div ref={trackRef} className="relative mt-16">
          {/* Linha central que preenche com o scroll */}
          <div className="absolute inset-y-0 left-6 w-0.5 bg-white/10 md:left-1/2 md:-translate-x-1/2" aria-hidden="true">
            <motion.div
              className="h-full w-full origin-top bg-gradient-to-b from-neon-purple to-neon-cyan"
              style={{ scaleY: lineScale }}
            />
          </div>

          <ol className="space-y-10 md:space-y-14">
            {STEPS.map(({ Icon, title, desc }, i) => {
              const fromLeft = i % 2 === 0
              return (
                <li key={title} className="relative md:grid md:grid-cols-2 md:gap-12">
                  {/* Marcador na linha */}
                  <motion.span
                    className="absolute left-6 top-1 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center
                      rounded-full border border-neon-cyan/60 bg-night-900 font-display text-sm font-bold text-neon-cyan
                      shadow-neon-blue md:left-1/2"
                    initial={{ scale: 0, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true, margin: '-100px' }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                  >
                    {i + 1}
                  </motion.span>

                  {/* Card da etapa */}
                  <motion.div
                    className={`ml-14 md:ml-0 ${fromLeft ? 'md:col-start-1 md:text-right' : 'md:col-start-2'}`}
                    initial={{ opacity: 0, x: fromLeft ? -48 : 48 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-100px' }}
                    transition={{ duration: 0.6, ease: [0.21, 0.65, 0.36, 1] }}
                  >
                    <div className="glass-card inline-block w-full p-6 text-left">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-neon-blue/10 text-neon-blue">
                        <Icon size={20} />
                      </span>
                      <h3 className="mt-3 font-display text-lg font-semibold text-white">{title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-400">{desc}</p>
                    </div>
                  </motion.div>
                </li>
              )
            })}
          </ol>
        </div>

        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <a
            href={whatsappLink(WHATSAPP_MESSAGES.agendar)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-neon"
          >
            <MessageCircle size={19} />
            Começar agora pelo WhatsApp
          </a>
        </motion.div>
      </div>
    </section>
  )
}
