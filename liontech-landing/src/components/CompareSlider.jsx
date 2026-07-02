import { useCallback, useRef, useState } from 'react'
import { ChevronsLeftRight } from 'lucide-react'

/**
 * Slider comparativo arrastável (antes/depois).
 * Arraste a alça — ou use as setas do teclado — para revelar a imagem "depois".
 *
 * Props:
 *  - beforeSrc / afterSrc: caminhos das imagens
 *  - beforeLabel / afterLabel: etiquetas exibidas nos cantos
 */
export default function CompareSlider({ beforeSrc, afterSrc, beforeLabel = 'Antes', afterLabel = 'Depois' }) {
  const containerRef = useRef(null)
  const [position, setPosition] = useState(50) // porcentagem revelada

  const updateFromClientX = useCallback((clientX) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const pct = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.min(100, Math.max(0, pct)))
  }, [])

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    updateFromClientX(e.clientX)
  }

  const onPointerMove = (e) => {
    if (e.buttons !== 1) return
    updateFromClientX(e.clientX)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft') setPosition((p) => Math.max(0, p - 5))
    if (e.key === 'ArrowRight') setPosition((p) => Math.min(100, p + 5))
  }

  return (
    <div
      ref={containerRef}
      className="relative aspect-[16/10] w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-2xl border border-white/10"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      role="slider"
      aria-label="Comparação antes e depois da limpeza"
      aria-valuenow={Math.round(position)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
    >
      {/* Imagem DEPOIS (fundo) */}
      <img src={afterSrc} alt="PC gamer depois da limpeza" className="absolute inset-0 h-full w-full object-cover" draggable={false} />

      {/* Imagem ANTES (recortada pela posição do slider) */}
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        <img src={beforeSrc} alt="PC gamer antes da limpeza" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      </div>

      {/* Etiquetas */}
      <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 font-display text-xs font-semibold text-red-300">
        {beforeLabel}
      </span>
      <span className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 font-display text-xs font-semibold text-emerald-300">
        {afterLabel}
      </span>

      {/* Linha divisória + alça */}
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${position}%` }}>
        <div className="absolute inset-y-0 -ml-px w-0.5 bg-neon-cyan shadow-neon-blue" />
        <div
          className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center
            rounded-full border border-neon-cyan/70 bg-night-900/90 text-neon-cyan shadow-neon-blue"
        >
          <ChevronsLeftRight size={20} />
        </div>
      </div>
    </div>
  )
}
