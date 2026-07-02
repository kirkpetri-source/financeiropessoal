import { motion } from 'framer-motion'

/**
 * Wrapper de scroll trigger: o conteúdo surge suavemente
 * quando entra na tela (uma única vez).
 *
 * Props:
 *  - delay: atraso em segundos (para efeito cascata)
 *  - y: deslocamento vertical inicial
 */
export default function Reveal({ children, delay = 0, y = 32, className = '' }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.21, 0.65, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
