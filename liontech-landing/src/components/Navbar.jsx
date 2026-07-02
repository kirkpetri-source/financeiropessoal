import { useEffect, useState } from 'react'
import { Menu, X, MessageCircle } from 'lucide-react'
import { whatsappLink, WHATSAPP_MESSAGES, COMPANY_NAME } from '../config.js'

const LINKS = [
  { href: '#servicos', label: 'Serviços' },
  { href: '#antes-depois', label: 'Antes e Depois' },
  { href: '#processo', label: 'Como funciona' },
  { href: '#produtos', label: 'Loja' },
  { href: '#localizacao', label: 'Localização' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 backdrop-blur-lg transition-all duration-300 ${
        scrolled ? 'border-b border-white/10 bg-night-950/90' : 'bg-night-950/60'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#inicio" className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-neon-purple to-neon-blue text-base">
            🦁
          </span>
          Lion<span className="text-neon-blue">Tech</span>
        </a>

        <div className="hidden items-center gap-8 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-300 transition-colors hover:text-neon-blue"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden lg:block">
          <a
            href={whatsappLink(WHATSAPP_MESSAGES.agendar)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-neon !px-5 !py-2.5 text-sm"
          >
            <MessageCircle size={17} />
            Agendar pelo WhatsApp
          </a>
        </div>

        <button
          className="rounded-lg border border-white/10 p-2 text-white lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* Menu mobile */}
      {open && (
        <div className="border-t border-white/10 bg-night-950/95 px-4 pb-6 pt-3 backdrop-blur-lg lg:hidden">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-3 text-sm font-medium text-slate-200 hover:bg-white/5 hover:text-neon-blue"
            >
              {link.label}
            </a>
          ))}
          <a
            href={whatsappLink(WHATSAPP_MESSAGES.agendar)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-neon mt-3 w-full text-sm"
          >
            <MessageCircle size={17} />
            Agendar pelo WhatsApp
          </a>
        </div>
      )}
      <span className="sr-only">{COMPANY_NAME}</span>
    </header>
  )
}
