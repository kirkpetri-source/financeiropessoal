import { Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp } from 'lucide-react';

/**
 * Moldura das páginas jurídicas. Fica fora do AppLayout porque termos e
 * política precisam abrir sem login — a landing page e o próprio Mercado Pago
 * linkam para elas, e exigir conta para ler o contrato é o contrário do que a
 * LGPD pede (informação acessível antes do consentimento).
 */

export const CONTATO_ENCARREGADO = 'kirkpetri@gmail.com';
export const ATUALIZADO_EM = '06 de agosto de 2026';

export default function LegalLayout({ titulo, resumo, children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900 leading-none">Financeiro Familiar</p>
            <p className="text-xs text-gray-400 leading-none mt-0.5">Lion Tech Soluções em TI</p>
          </div>
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
        <p className="text-sm text-gray-500 mt-1">Atualizado em {ATUALIZADO_EM}</p>
        {resumo && (
          <p className="mt-4 text-sm text-gray-700 bg-white border border-gray-100 rounded-2xl p-4">
            {resumo}
          </p>
        )}

        <article className="mt-6 space-y-6">{children}</article>

        <footer className="mt-10 pt-6 border-t border-gray-200 text-xs text-gray-400 space-y-1">
          <p>LION TECH SOLUÇÕES EM TI LTDA · CNPJ 44.124.574/0001-47 · Mineiros-GO</p>
          <p>
            liontechti.com.br · WhatsApp (64) 9 9955-5364 ·{' '}
            <Link to="/termos" className="underline">Termos</Link> ·{' '}
            <Link to="/privacidade" className="underline">Privacidade</Link>
          </p>
        </footer>
      </main>
    </div>
  );
}

export function Secao({ titulo, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
      <div className="text-sm text-gray-700 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
