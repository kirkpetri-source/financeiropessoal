import { MapPin, ExternalLink, Instagram } from 'lucide-react'
import {
  COMPANY_ADDRESS,
  COMPANY_CITY,
  GOOGLE_MAPS_URL,
  GOOGLE_MAPS_EMBED_URL,
  INSTAGRAM_URL,
  INSTAGRAM_USER,
} from '../config.js'
import SectionHeader from './ui/SectionHeader.jsx'
import Reveal from './ui/Reveal.jsx'

/* ============================================================
   SUBSTITUA A FOTO REAL DA LOJA AQUI 👇
   Troque src/assets/placeholders/loja.svg por uma foto real
   da fachada da Lion Tech (paisagem, ~1200x750px).
   ============================================================ */
import lojaFoto from '../assets/placeholders/loja.svg'

export default function Location() {
  return (
    <section id="localizacao" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          kicker="Localização"
          title={`Visite a Lion Tech em ${COMPANY_CITY}`}
          description="Estamos no Centro de Mineiros, prontos para receber você e o seu equipamento."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Reveal>
            <div className="glass-card flex h-full flex-col gap-6 p-8">
              <img
                src={lojaFoto}
                alt="Fachada da loja Lion Tech em Mineiros-GO"
                className="aspect-[16/10] w-full rounded-xl object-cover"
                loading="lazy"
              />
              <div className="flex items-start gap-3">
                <MapPin size={22} className="mt-0.5 shrink-0 text-neon-cyan" />
                <div>
                  <h3 className="font-display font-semibold text-white">Endereço</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{COMPANY_ADDRESS}</p>
                </div>
              </div>
              <div className="mt-auto flex flex-col gap-3 sm:flex-row">
                <a href={GOOGLE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="btn-neon flex-1 text-sm">
                  <MapPin size={17} />
                  Abrir no Google Maps
                </a>
                <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="btn-ghost flex-1 text-sm">
                  <Instagram size={17} />@{INSTAGRAM_USER}
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            {/* Mapa incorporado do Google Maps (sem chave de API) */}
            <div className="glass-card h-full min-h-[380px] overflow-hidden p-2">
              <iframe
                title="Mapa: Lion Tech em Mineiros-GO"
                src={GOOGLE_MAPS_EMBED_URL}
                className="h-full min-h-[364px] w-full rounded-xl border-0 grayscale-[35%] invert-[8%]"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
