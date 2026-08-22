import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer, FileText, ShieldCheck } from 'lucide-react';
import Logo from '../../components/brand/Logo';

/**
 * Moldura das páginas jurídicas.
 *
 * Fica fora do AppLayout porque termos e política precisam abrir sem login — a
 * landing page e o próprio Mercado Pago linkam para elas, e exigir conta para
 * ler o contrato é o contrário do que a LGPD pede (informação acessível antes
 * do consentimento).
 *
 * A apresentação é de DOCUMENTO, não de página de marketing: índice lateral
 * fixo, cláusulas numeradas em hierarquia (4.2, 4.3), largura de leitura
 * confortável e uma folha branca sobre fundo cinza. Contrato que parece post
 * de blog não transmite a seriedade de um serviço que cobra mensalidade e
 * guarda dado financeiro — e, na prática, é mais difícil de citar: sem número
 * de cláusula, ninguém consegue dizer "conforme o item 6.2".
 *
 * `@media print` existe porque cliente e advogado imprimem contrato. Sem isso
 * o índice e os botões iriam para o papel junto.
 */

export const CONTATO_ENCARREGADO = 'kirkpetri@gmail.com';
export const ATUALIZADO_EM = '22 de agosto de 2026';
export const VERSAO = '2.0';
export const VIGENCIA = '22 de agosto de 2026';

const RAZAO_SOCIAL = 'LION TECH SOLUÇÕES EM TI LTDA';
const CNPJ = '44.124.574/0001-47';
const ENDERECO = 'Mineiros — GO, Brasil';
const WHATSAPP = '(64) 9 9955-5364';

/**
 * Índice lateral, montado a partir dos títulos que já estão na página.
 *
 * Lê o DOM em vez de exigir uma lista duplicada no componente: um índice
 * escrito à mão desatualiza no dia em que alguém acrescenta uma cláusula, e um
 * índice errado é pior que nenhum.
 */
function Indice() {
  const [secoes, setSecoes] = useState([]);
  const [ativa, setAtiva] = useState(null);

  useEffect(() => {
    const achados = Array.from(document.querySelectorAll('article h2[id]'))
      .map((h) => ({ id: h.id, texto: h.textContent }));
    setSecoes(achados);

    // Marca no índice em que cláusula a leitura está. `rootMargin` negativo no
    // topo faz a seção só contar quando de fato chega à área de leitura, e não
    // no instante em que encosta na borda de baixo da tela.
    const observador = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas.find((e) => e.isIntersecting);
        if (visivel) setAtiva(visivel.target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );

    achados.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observador.observe(el);
    });

    return () => observador.disconnect();
  }, []);

  if (!secoes.length) return null;

  return (
    <nav className="hidden lg:block sticky top-8 self-start w-56 shrink-0 print:hidden" aria-label="Índice do documento">
      <p className="text-xs font-semibold uppercase tracking-wide text-faint mb-2">Índice</p>
      <ol className="space-y-1 border-l border-border">
        {secoes.map(({ id, texto }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className={`block text-xs leading-snug py-1 pl-3 -ml-px border-l transition-colors
                          ${ativa === id
                ? 'border-brand text-brand-dark font-medium'
                : 'border-transparent text-muted hover:text-ink'}`}
            >
              {texto}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default function LegalLayout({ titulo, resumo, tipo = 'termos', children }) {
  const Icone = tipo === 'privacidade' ? ShieldCheck : FileText;

  return (
    <div className="min-h-screen bg-surface-alt">
      <header className="bg-white border-b border-border print:hidden">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Logo size="sm" />
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => window.print()}
            className="text-sm text-muted hover:text-ink flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" /> Imprimir
          </button>
          <Link to="/" className="text-sm text-muted hover:text-ink flex items-center gap-1 ml-4">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 flex gap-10 items-start">
        <Indice />

        <main className="flex-1 min-w-0 max-w-3xl bg-white border border-border rounded-card
                         px-6 py-8 sm:px-10 sm:py-10 print:border-0 print:px-0 print:py-0">
          <div className="flex items-start gap-3 pb-6 border-b border-border">
            <div className="w-10 h-10 rounded-xl bg-brand-light flex items-center justify-center shrink-0">
              <Icone className="w-5 h-5 text-brand-dark" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-ink leading-tight">{titulo}</h1>
              {/* Versão e vigência explícitas: sem elas não há como provar qual
                  texto valia na data de uma contratação — é o primeiro
                  documento que se pede numa disputa de consumo. */}
              <p className="text-xs text-muted mt-1.5 font-mono">
                Versão {VERSAO} · Vigente desde {VIGENCIA} · Atualizado em {ATUALIZADO_EM}
              </p>
            </div>
          </div>

          {resumo && (
            <aside className="mt-6 border-l-2 border-brand bg-brand-light/40 rounded-r-card px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark mb-1">
                Resumo em linguagem simples
              </p>
              <p className="text-sm text-ink leading-relaxed">{resumo}</p>
              <p className="text-xs text-muted mt-2">
                Este resumo é uma cortesia de leitura e não substitui o texto completo abaixo.
              </p>
            </aside>
          )}

          <article className="mt-8 space-y-7">{children}</article>

          <footer className="mt-12 pt-6 border-t border-border text-xs text-muted space-y-1.5">
            <p className="font-medium text-ink">{RAZAO_SOCIAL}</p>
            <p>CNPJ {CNPJ} · {ENDERECO}</p>
            <p>
              liontechti.com.br · WhatsApp {WHATSAPP} · {CONTATO_ENCARREGADO}
            </p>
            <p className="pt-2 print:hidden">
              <Link to="/termos" className="underline hover:text-ink">Termos de Uso</Link>
              {' · '}
              <Link to="/privacidade" className="underline hover:text-ink">Política de Privacidade</Link>
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}

/**
 * Uma cláusula numerada.
 *
 * O `id` sai do número (`clausula-4`), então o link do índice e o link que
 * alguém copia da barra de endereços apontam para a mesma coisa e continuam
 * válidos enquanto o número não mudar.
 */
export function Secao({ numero, titulo, children }) {
  const id = `clausula-${numero}`;

  return (
    <section className="scroll-mt-8">
      <h2 id={id} className="text-base font-bold text-ink flex gap-2 items-baseline">
        <span className="font-mono text-sm text-brand-dark shrink-0">{numero}.</span>
        <span>{titulo}</span>
      </h2>
      <div className="mt-2 pl-6 text-sm text-ink leading-relaxed space-y-2.5">{children}</div>
    </section>
  );
}

/** Subcláusula: o "4.2" que permite citar um ponto específico numa discussão. */
export function Item({ numero, children }) {
  return (
    <p className="flex gap-2">
      <span className="font-mono text-xs text-muted shrink-0 pt-0.5">{numero}</span>
      <span>{children}</span>
    </p>
  );
}

/** Destaque para o que o leitor não pode perder — prazo, valor, perda de direito. */
export function Atencao({ children }) {
  return (
    <p className="border-l-2 border-amber-400 bg-amber-50 px-3 py-2 rounded-r text-sm">
      {children}
    </p>
  );
}

/** Tabela de leitura (retenção, subprocessadores). Rola sozinha no celular. */
export function Tabela({ colunas, linhas }) {
  const largura = useMemo(() => `${100 / colunas.length}%`, [colunas.length]);

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-xs border border-border rounded-card overflow-hidden">
        <thead>
          <tr className="bg-surface-alt">
            {colunas.map((c) => (
              <th key={c} style={{ width: largura }} className="text-left font-semibold text-ink px-3 py-2 border-b border-border">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={i} className="border-b border-border last:border-0 align-top">
              {linha.map((celula, j) => (
                <td key={j} className="px-3 py-2 text-ink">{celula}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
