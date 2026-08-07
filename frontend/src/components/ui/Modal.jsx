import { Dialog, DialogContent, DialogTitle } from './dialog';

const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

/**
 * Wrapper fino sobre o Dialog do Radix, mantendo a mesma API que o resto do
 * app já usa (isOpen/onClose/title/size) — troca a implementação por baixo
 * (focus trap, Esc, aria-modal de graça) sem precisar mexer nos 3 call sites
 * (Dashboard, Categories, Transactions).
 */
export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className={`${SIZES[size] ?? SIZES.md} flex max-h-[90vh] flex-col p-0`}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold text-ink">{title}</DialogTitle>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
