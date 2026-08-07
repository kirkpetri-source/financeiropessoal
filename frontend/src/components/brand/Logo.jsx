import { cn } from '@/lib/utils';

/**
 * Marca definitiva do RevelaCash (mockup entregue em 08/08/2026). O ícone é
 * o arquivo processado em public/brand/ — fundo e sombra do render 3D
 * removidos, recortado e convertido pra WebP (ver public/brand/source/ para
 * os PNGs originais, fora do git). Quando houver um retoque de marca, troca
 * pontual aqui, sem precisar mexer em cada tela que usa <Logo />.
 */
const SIZES = {
  sm: { mark: 'h-7 w-7', word: 'text-sm' },
  md: { mark: 'h-9 w-9', word: 'text-lg' },
  lg: { mark: 'h-14 w-14', word: 'text-3xl' },
};

export default function Logo({ size = 'md', withWordmark = true, className }) {
  const s = SIZES[size] ?? SIZES.md;
  return (
    <div className={cn('inline-flex items-center gap-2.5', className)}>
      <img
        src="/brand/icon-color-256.webp"
        alt={withWordmark ? '' : 'RevelaCash'}
        aria-hidden={withWordmark}
        className={cn('shrink-0 object-contain', s.mark)}
      />
      {withWordmark && (
        <span className={cn('font-sans font-extrabold tracking-tight', s.word)}>
          <span className="text-brand">Revela</span>
          <span className="text-accent">Cash</span>
        </span>
      )}
    </div>
  );
}
