import { Wind, Thermometer, Gauge, Volume2, HeartPulse, MessageCircle } from 'lucide-react'
import { whatsappLink, WHATSAPP_MESSAGES } from '../config.js'
import SectionHeader from './ui/SectionHeader.jsx'
import Reveal from './ui/Reveal.jsx'
import CompareSlider from './CompareSlider.jsx'

/* ============================================================
   SUBSTITUA AS FOTOS REAIS AQUI 👇
   Troque os arquivos em src/assets/placeholders/ pelas fotos
   reais de antes/depois das limpezas (mesmos nomes, ou ajuste
   os imports abaixo). Use fotos em paisagem, ~1200x750px.
   ============================================================ */
import antes1 from '../assets/placeholders/antes-1.svg'
import depois1 from '../assets/placeholders/depois-1.svg'
import antes2 from '../assets/placeholders/antes-2.svg'
import depois2 from '../assets/placeholders/depois-2.svg'
import antes3 from '../assets/placeholders/antes-3.svg'
import depois3 from '../assets/placeholders/depois-3.svg'

const GALLERY = [
  { before: antes2, after: depois2, caption: 'Coolers e placa de vídeo' },
  { before: antes3, after: depois3, caption: 'Fonte e gabinete' },
]

const RISKS = [
  { Icon: Wind, title: 'Poeira acumulada', desc: 'A poeira bloqueia a ventilação e cobre os componentes internos.' },
  { Icon: Thermometer, title: 'Superaquecimento', desc: 'Temperaturas altas causam desligamentos e danos permanentes.' },
  { Icon: Gauge, title: 'Queda de desempenho', desc: 'O PC reduz a velocidade para se proteger do calor (thermal throttling).' },
  { Icon: Volume2, title: 'Ruído alto', desc: 'Coolers sujos giram mais rápido e fazem muito mais barulho.' },
  { Icon: HeartPulse, title: 'Vida útil reduzida', desc: 'Calor constante encurta a vida da placa de vídeo, CPU e fonte.' },
]

export default function BeforeAfter() {
  return (
    <section id="antes-depois" className="relative py-20 sm:py-28">
      <div className="absolute right-0 top-0 h-[400px] w-[420px] rounded-full bg-neon-blue/10 blur-[130px]" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          kicker="Antes e depois"
          title="A diferença que uma limpeza faz"
          description="Arraste o comparador e veja como um PC gamer sai da bancada da Lion Tech. A limpeza preventiva é o serviço mais barato que existe para evitar o prejuízo mais caro."
        />

        {/* Slider comparativo principal */}
        <Reveal className="mx-auto mt-12 max-w-3xl">
          <CompareSlider beforeSrc={antes1} afterSrc={depois1} />
          <p className="mt-3 text-center text-xs text-slate-500">
            Arraste a alça para comparar • Gabinete completo
          </p>
        </Reveal>

        {/* Galeria de pares antes/depois */}
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {GALLERY.map(({ before, after, caption }, i) => (
            <Reveal key={caption} delay={i * 0.1}>
              <div className="glass-card overflow-hidden p-3">
                <div className="grid grid-cols-2 gap-3">
                  <figure>
                    <img src={before} alt={`${caption} antes da limpeza`} className="aspect-[4/3] w-full rounded-xl object-cover" loading="lazy" />
                    <figcaption className="mt-2 text-center font-display text-xs font-semibold text-red-300">ANTES</figcaption>
                  </figure>
                  <figure>
                    <img src={after} alt={`${caption} depois da limpeza`} className="aspect-[4/3] w-full rounded-xl object-cover" loading="lazy" />
                    <figcaption className="mt-2 text-center font-display text-xs font-semibold text-emerald-300">DEPOIS</figcaption>
                  </figure>
                </div>
                <p className="mt-3 pb-1 text-center text-sm text-slate-400">{caption}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Por que a limpeza preventiva importa */}
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {RISKS.map(({ Icon, title, desc }, i) => (
            <Reveal key={title} delay={i * 0.07}>
              <div className="glass-card h-full p-5">
                <Icon size={22} className="text-neon-violet" />
                <h3 className="mt-3 font-display text-sm font-semibold text-white">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* CTA da seção */}
        <Reveal className="mt-14 text-center">
          <h3 className="font-display text-2xl font-bold text-white sm:text-3xl">
            Seu PC gamer está precisando de uma limpeza?
          </h3>
          <a
            href={whatsappLink(WHATSAPP_MESSAGES.limpeza)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-neon mt-6"
          >
            <MessageCircle size={19} />
            Agendar limpeza pelo WhatsApp
          </a>
        </Reveal>
      </div>
    </section>
  )
}
