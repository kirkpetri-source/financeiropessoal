import { cn } from '@/lib/utils';

/**
 * Wordmark provisório do RevelaCash. Os mockups finais de logo (ícone +
 * tratamento visual) serão feitos separadamente — este componente existe
 * pra não bloquear o redesign com o ícone genérico antigo (TrendingUp
 * dentro de um quadrado verde). Quando o mockup definitivo chegar, troca
 * pontual aqui, sem precisar mexer em cada tela que usa <Logo />.
 */
const SIZES = {
  sm: { mark: 'h-7 w-7 text-xs', word: 'text-sm' },
  md: { mark: 'h-9 w-9 text-sm', word: 'text-lg' },
  lg: { mark: 'h-14 w-14 text-xl', word: 'text-3xl' },
};

export default function Logo({ size = 'md', withWordmark = true, className }) {
  const s = SIZES[size] ?? SIZES.md;
  return (
    <div className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-xl bg-brand font-sans font-extrabold text-white',
          s.mark
        )}
        aria-hidden={withWordmark}
      >
        R
      </span>
      {withWordmark && (
        <span className={cn('font-sans font-extrabold tracking-tight', s.word)}>
          <span className="text-ink">Revela</span>
          <span className="text-brand">Cash</span>
        </span>
      )}
    </div>
  );
}
