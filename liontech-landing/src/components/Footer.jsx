import { Instagram, MessageCircle, MapPin, Globe } from 'lucide-react'
import {
  COMPANY_NAME,
  COMPANY_ADDRESS,
  INSTAGRAM_URL,
  INSTAGRAM_USER,
  SITE_URL,
  whatsappLink,
  WHATSAPP_MESSAGES,
} from '../config.js'

const QUICK_LINKS = [
  { href: '#servicos', label: 'Serviços' },
  { href: '#antes-depois', label: 'Antes e Depois' },
  { href: '#processo', label: 'Como funciona' },
  { href: '#produtos', label: 'Loja' },
  { href: '#localizacao', label: 'Localização' },
  { href: '#agendamento', label: 'Agendamento' },
]

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-white/10 bg-night-900">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-3">
          {/* Marca */}
          <div>
            <a href="#inicio" className="flex items-center gap-2 font-display text-xl font-bold text-white">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-neon-purple to-neon-blue">
                🦁
              </span>
              Lion<span className="text-neon-blue">Tech</span>
            </a>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              {COMPANY_NAME} — loja de informática e assistência técnica em Mineiros-GO. Manutenção,
              upgrades, limpeza de PC gamer e venda de eletrônicos.
            </p>
          </div>

          {/* Links rápidos */}
          <div>
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-white">Links rápidos</h3>
            <ul className="mt-4 grid grid-cols-2 gap-2">
              {QUICK_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <a href={href} className="text-sm text-slate-400 transition-colors hover:text-neon-blue">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contato */}
          <div>
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-white">Contato</h3>
            <ul className="mt-4 space-y-3 text-sm text-slate-400">
              <li>
                <a
                  href={whatsappLink(WHATSAPP_MESSAGES.agendar)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 transition-colors hover:text-neon-cyan"
                >
                  <MessageCircle size={16} className="text-neon-cyan" />
                  WhatsApp — agendar atendimento
                </a>
              </li>
              <li>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 transition-colors hover:text-neon-violet"
                >
                  <Instagram size={16} className="text-neon-violet" />@{INSTAGRAM_USER}
                </a>
              </li>
              <li>
                <a
                  href={SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 transition-colors hover:text-neon-blue"
                >
                  <Globe size={16} className="text-neon-blue" />
                  liontechti.com.br
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 shrink-0 text-neon-blue" />
                {COMPANY_ADDRESS}
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-slate-500">
          © {year} {COMPANY_NAME}. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  )
}
