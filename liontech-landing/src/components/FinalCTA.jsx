import { motion } from 'framer-motion'
import { MessageCircle, Calculator, MapPin } from 'lucide-react'
import { whatsappLink, WHATSAPP_MESSAGES, GOOGLE_MAPS_URL } from '../config.js'

export default function FinalCTA() {
  return (
    <section id="cta-final" className="relative overflow-hidden py-24 sm:py-32">
      {/* Fundo com brilho forte para o fechamento */}
      <div className="absolute inset-0 bg-grid-tech bg-[size:56px_56px]" aria-hidden="true" />
      <div
        className="absolute left-1/2 top-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full
          bg-gradient-to-r from-neon-purple/25 to-neon-blue/25 blur-[130px]"
        aria-hidden="true"
      />

      <motion.div
        className="relative mx-auto max-w-3xl px-4 text-center sm:px-6"
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: [0.21, 0.65, 0.36, 1] }}
      >
        <h2 className="font-display text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
          Seu computador, notebook ou celular{' '}
          <span className="bg-gradient-to-r from-neon-violet to-neon-cyan bg-clip-text text-transparent">
            precisa de ajuda?
          </span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-slate-400 sm:text-lg">
          Fale agora com a Lion Tech. Diagnóstico profissional, orçamento transparente e atendimento local em Mineiros-GO.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={whatsappLink(WHATSAPP_MESSAGES.agendar)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-neon w-full sm:w-auto"
          >
            <MessageCircle size={19} />
            Agendar pelo WhatsApp
          </a>
          <a
            href={whatsappLink(WHATSAPP_MESSAGES.orcamento)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost w-full sm:w-auto"
          >
            <Calculator size={18} />
            Solicitar orçamento
          </a>
          <a href={GOOGLE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="btn-ghost w-full sm:w-auto">
            <MapPin size={18} />
            Ver localização
          </a>
        </div>
      </motion.div>
    </section>
  )
}
