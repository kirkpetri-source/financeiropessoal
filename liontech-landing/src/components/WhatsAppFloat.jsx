import { motion } from 'framer-motion'
import { MessageCircle } from 'lucide-react'
import { whatsappLink, WHATSAPP_MESSAGES } from '../config.js'

/** Botão flutuante do WhatsApp, sempre visível no canto da tela. */
export default function WhatsAppFloat() {
  return (
    <motion.a
      href={whatsappLink(WHATSAPP_MESSAGES.agendar)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a Lion Tech no WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full
        bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-[0_0_24px_-4px_rgba(16,185,129,0.7)]
        transition-transform hover:scale-110"
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 1.2, type: 'spring', stiffness: 220, damping: 16 }}
    >
      <MessageCircle size={26} />
    </motion.a>
  )
}
