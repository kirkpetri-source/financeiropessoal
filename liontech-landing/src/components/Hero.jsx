import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { MessageCircle, ChevronDown, Monitor, Laptop, Smartphone, Cpu, MapPin } from 'lucide-react'
import { whatsappLink, WHATSAPP_MESSAGES, COMPANY_CITY } from '../config.js'

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: 0.12 * i, ease: [0.21, 0.65, 0.36, 1] },
  }),
}

// Composição visual do hero: dispositivos flutuantes com brilho neon
const DEVICES = [
  { Icon: Monitor, label: 'Computadores', className: 'left-[6%] top-[8%]', delay: 0 },
  { Icon: Laptop, label: 'Notebooks', className: 'right-[8%] top-[16%]', delay: 0.8 },
  { Icon: Smartphone, label: 'Celulares', className: 'left-[14%] bottom-[14%]', delay: 1.6 },
  { Icon: Cpu, label: 'PC Gamer', className: 'right-[12%] bottom-[8%]', delay: 2.4 },
]

export default function Hero() {
  const sectionRef = useRef(null)
  // Parallax: o conteúdo sobe mais devagar e esmaece conforme o usuário rola
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] })
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 140])
  const contentOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0])

  return (
    <section ref={sectionRef} id="inicio" className="relative flex min-h-svh items-center overflow-hidden pt-16">
      {/* Fundo: grid tecnológico + brilhos de cor */}
      <div className="absolute inset-0 bg-grid-tech bg-[size:56px_56px]" aria-hidden="true" />
      <div
        className="absolute -top-32 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-neon-purple/20 blur-[140px]"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-40 right-0 h-[380px] w-[520px] rounded-full bg-neon-blue/15 blur-[120px]"
        aria-hidden="true"
      />

      {/* Dispositivos flutuantes (decorativos) */}
      {DEVICES.map(({ Icon, label, className, delay }) => (
        <motion.div
          key={label}
          className={`glass-card absolute hidden items-center gap-2 px-4 py-3 text-sm text-slate-300 md:flex ${className}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1, y: [0, -10, 0] }}
          transition={{
            opacity: { duration: 0.8, delay: 0.6 + delay * 0.15 },
            scale: { duration: 0.8, delay: 0.6 + delay * 0.15 },
            y: { duration: 5, repeat: Infinity, ease: 'easeInOut', delay },
          }}
          aria-hidden="true"
        >
          <Icon size={18} className="text-neon-blue" />
          {label}
        </motion.div>
      ))}

      <motion.div
        className="relative mx-auto max-w-4xl px-4 py-24 text-center sm:px-6"
        style={{ y: contentY, opacity: contentOpacity }}
      >
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
          <span className="section-kicker inline-flex items-center gap-2">
            <MapPin size={13} />
            Loja física em {COMPANY_CITY}
          </span>
        </motion.div>

        <motion.h1
          className="font-display text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={1}
        >
          Assistência técnica de verdade{' '}
          <span className="bg-gradient-to-r from-neon-violet to-neon-cyan bg-clip-text text-transparent">
            em Mineiros-GO
          </span>
        </motion.h1>

        <motion.p
          className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={2}
        >
          A Lion Tech cuida do seu computador, notebook e celular — manutenção, limpeza de PC gamer,
          formatação, upgrades e uma loja completa de informática e eletrônicos. Tudo em um só lugar,
          com atendimento local.
        </motion.p>

        <motion.div
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={3}
        >
          <a
            href={whatsappLink(WHATSAPP_MESSAGES.agendar)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-neon w-full sm:w-auto"
          >
            <MessageCircle size={19} />
            Agendar pelo WhatsApp
          </a>
          <a href="#servicos" className="btn-ghost w-full sm:w-auto">
            Ver serviços
            <ChevronDown size={18} />
          </a>
        </motion.div>
      </motion.div>

      {/* Indicador de scroll */}
      <motion.a
        href="#agendamento"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-slate-500 transition-colors hover:text-neon-blue"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        aria-label="Rolar para baixo"
      >
        <ChevronDown size={26} />
      </motion.a>
    </section>
  )
}
