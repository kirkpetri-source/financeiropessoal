import { useEffect, useRef, useState } from 'react';

/**
 * Anima um número de 0 (ou do valor anterior) até `value` em `duration`ms.
 * CSS puro não anima o conteúdo de texto de um número — isso precisa de JS,
 * mas sem nenhuma dependência nova (só requestAnimationFrame).
 */
export function useCountUp(value, duration = 650) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
    const from = fromRef.current;
    const to = value;
    const start = performance.now();

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(to);
      fromRef.current = to;
      return undefined;
    }

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return display;
}
