import Reveal from './Reveal.jsx'

/** Cabeçalho padrão das seções: kicker + título + descrição. */
export default function SectionHeader({ kicker, title, description, align = 'center' }) {
  const alignClass = align === 'center' ? 'mx-auto text-center' : 'text-left'
  return (
    <Reveal className={`max-w-3xl ${alignClass}`}>
      {kicker && <span className="section-kicker">{kicker}</span>}
      <h2 className="section-title">{title}</h2>
      {description && <p className="mt-4 text-base leading-relaxed text-slate-400 sm:text-lg">{description}</p>}
    </Reveal>
  )
}
