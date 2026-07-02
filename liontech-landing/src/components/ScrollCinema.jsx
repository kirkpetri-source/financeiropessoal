import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useMotionValueEvent } from 'framer-motion'

/* ============================================================
   SEÇÃO "CINEMA DE SCROLL" — a animação avança como um vídeo
   controlado pela rolagem da página (estilo Apple).

   ▶ COMO USAR FRAMES DE VÍDEO REAIS (opcional, recomendado):
   1. Grave um vídeo curto da limpeza de um PC (10–15s)
   2. Exporte como sequência de imagens com o ffmpeg:
        ffmpeg -i video.mp4 -vf "scale=1080:-2,fps=8" \
          public/sequence/frame-%03d.jpg
   3. Coloque os arquivos em  public/sequence/
   4. Ajuste FRAME_COUNT abaixo para o total de frames gerados
   Enquanto FRAME_COUNT for 0, uma animação em canvas leve é
   desenhada no lugar (PC empoeirado → limpeza → neon aceso).
   ============================================================ */
const FRAME_COUNT = 0
const frameSrc = (i) => `/sequence/frame-${String(i + 1).padStart(3, '0')}.jpg`

// Legendas exibidas conforme o progresso da rolagem
const STAGES = [
  { until: 0.35, title: 'Assim o PC chega na bancada', text: 'Poeira acumulada, temperatura alta e coolers barulhentos.' },
  { until: 0.7, title: 'Limpeza profissional Lion Tech', text: 'Cada componente limpo com cuidado, pasta térmica renovada.' },
  { until: 1.01, title: 'Performance de volta', text: 'Silencioso, gelado e pronto para jogar. Assim ele volta pra você.' },
]

// Gerador pseudo-aleatório com semente fixa (partículas estáveis entre renders)
function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r)
  } else {
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
}

/** Desenha a cena procedural para um progresso p ∈ [0, 1]. */
function drawScene(ctx, w, h, p) {
  ctx.clearRect(0, 0, w, h)

  const glow = Math.min(1, Math.max(0, (p - 0.45) / 0.45)) // neon acende na 2ª metade
  const dirt = Math.min(1, Math.max(0, 1 - p / 0.55)) // poeira some até ~55%

  const cx = w / 2
  const cy = h / 2
  const cw = Math.min(w * 0.78, 460)
  const ch = cw * 0.68
  const x = cx - cw / 2
  const y = cy - ch / 2

  // Gabinete
  ctx.save()
  if (glow > 0) {
    ctx.shadowColor = `rgba(139, 92, 246, ${0.85 * glow})`
    ctx.shadowBlur = 46 * glow
  }
  roundedRect(ctx, x, y, cw, ch, 20)
  ctx.fillStyle = '#15151f'
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = glow > 0 ? `rgba(167, 139, 250, ${0.35 + 0.65 * glow})` : 'rgba(255,255,255,0.16)'
  ctx.stroke()
  ctx.restore()

  // Vidro lateral (linha divisória)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x + cw * 0.72, y + 12)
  ctx.lineTo(x + cw * 0.72, y + ch - 12)
  ctx.stroke()

  // Coolers girando conforme o scroll
  const r = ch * 0.21
  const fans = [
    [x + cw * 0.26, y + ch * 0.32],
    [x + cw * 0.26, y + ch * 0.72],
    [x + cw * 0.54, y + ch * 0.5],
  ]
  const spin = p * Math.PI * 7
  for (const [fx, fy] of fans) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(fx, fy, r, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(255,255,255,${0.14 + 0.12 * glow})`
    ctx.lineWidth = 2
    ctx.stroke()
    for (let b = 0; b < 3; b++) {
      const a = spin + b * ((Math.PI * 2) / 3)
      ctx.beginPath()
      ctx.moveTo(fx, fy)
      ctx.arc(fx, fy, r * 0.8, a, a + 0.95)
      ctx.closePath()
      ctx.fillStyle = glow > 0 ? `rgba(56, 189, 248, ${0.2 + 0.5 * glow})` : `rgba(120, 116, 100, ${0.3 + 0.2 * dirt})`
      ctx.fill()
    }
    if (glow > 0) {
      ctx.beginPath()
      ctx.arc(fx, fy, r + 5, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.85 * glow})`
      ctx.lineWidth = 3
      ctx.shadowColor = 'rgba(34, 211, 238, 0.9)'
      ctx.shadowBlur = 20 * glow
      ctx.stroke()
    }
    ctx.restore()
  }

  // Poeira: partículas voam para fora e somem conforme a limpeza avança
  if (dirt > 0.02) {
    const rand = mulberry32(1337)
    const blown = 1 - dirt
    for (let i = 0; i < 110; i++) {
      const px = x + rand() * cw
      const py = y + rand() * ch
      const size = 1 + rand() * 2.6
      const angle = rand() * Math.PI * 2
      const drift = blown * (30 + rand() * 90)
      const alpha = dirt * (0.25 + rand() * 0.4)
      ctx.beginPath()
      ctx.arc(px + Math.cos(angle) * drift, py + Math.sin(angle) * drift - blown * 20, size, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(155, 138, 105, ${alpha})`
      ctx.fill()
    }
  }

  // Brilhos finais
  if (p > 0.82) {
    const s = (p - 0.82) / 0.18
    const rand = mulberry32(7)
    for (let i = 0; i < 7; i++) {
      const sx = x + rand() * cw
      const sy = y + rand() * ch * 0.6
      const len = (3 + rand() * 5) * s
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * s})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(sx - len, sy)
      ctx.lineTo(sx + len, sy)
      ctx.moveTo(sx, sy - len)
      ctx.lineTo(sx, sy + len)
      ctx.stroke()
    }
  }
}

export default function ScrollCinema() {
  const trackRef = useRef(null)
  const canvasRef = useRef(null)
  const framesRef = useRef([])
  const progressRef = useRef(0)
  const rafRef = useRef(0)
  const [stage, setStage] = useState(0)

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] })

  // Redesenha o canvas (no máximo 1x por frame de tela)
  const render = () => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const p = progressRef.current

      if (FRAME_COUNT > 0) {
        // Modo vídeo real: desenha o frame correspondente ao progresso
        const idx = Math.min(FRAME_COUNT - 1, Math.floor(p * FRAME_COUNT))
        const img = framesRef.current[idx]
        if (img?.complete) {
          const scale = Math.max(w / img.width, h / img.height)
          const iw = img.width * scale
          const ih = img.height * scale
          ctx.clearRect(0, 0, w, h)
          ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih)
        }
      } else {
        drawScene(ctx, w, h, p)
      }
    })
  }

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    progressRef.current = v
    const idx = STAGES.findIndex((s) => v <= s.until)
    setStage(idx === -1 ? STAGES.length - 1 : idx)
    render()
  })

  useEffect(() => {
    // Pré-carrega os frames reais, se configurados
    if (FRAME_COUNT > 0) {
      framesRef.current = Array.from({ length: FRAME_COUNT }, (_, i) => {
        const img = new Image()
        img.src = frameSrc(i)
        img.onload = render
        return img
      })
    }
    render()
    window.addEventListener('resize', render)
    return () => {
      window.removeEventListener('resize', render)
      cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    // Trilho de 300vh: a tela fica "presa" enquanto a animação avança
    <section ref={trackRef} id="cinema" className="relative h-[300vh]">
      <div className="sticky top-0 flex h-svh flex-col items-center justify-center overflow-hidden">
        {/* brilhos de fundo */}
        <div className="absolute left-1/4 top-1/4 h-[300px] w-[300px] rounded-full bg-neon-purple/10 blur-[120px]" aria-hidden="true" />
        <div className="absolute bottom-1/4 right-1/4 h-[300px] w-[300px] rounded-full bg-neon-blue/10 blur-[120px]" aria-hidden="true" />

        <div className="relative mx-auto w-full max-w-3xl px-4 sm:px-6">
          <p className="section-kicker mx-auto block w-fit">Role para ver a transformação</p>

          <canvas
            ref={canvasRef}
            className="mt-4 aspect-[16/11] w-full rounded-2xl border border-white/10 bg-night-900/60"
            aria-label="Animação: PC gamer sendo limpo, da poeira ao neon"
          />

          {/* Legenda que muda conforme o progresso */}
          <div className="mt-6 min-h-[88px] text-center">
            <motion.div key={stage} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <h2 className="font-display text-xl font-bold text-white sm:text-2xl">{STAGES[stage].title}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400 sm:text-base">{STAGES[stage].text}</p>
            </motion.div>
          </div>

          {/* Barra de progresso da cena */}
          <div className="mx-auto mt-2 h-1 w-40 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full origin-left bg-gradient-to-r from-neon-purple to-neon-cyan"
              style={{ scaleX: scrollYProgress }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
