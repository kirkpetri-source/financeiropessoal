import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  Search, ArrowLeft, ArrowRight, ChevronRight, LifeBuoy, X, BookOpen,
} from 'lucide-react';
import Logo from '../components/brand/Logo';
import {
  TEMAS, artigoPorSlug, artigosDoTema, buscarArtigos,
} from '../conteudo/ajuda';

/**
 * Central de ajuda — página PÚBLICA, sem login.
 *
 * Pública de propósito: metade das dúvidas ("como conecto o WhatsApp?", "o que
 * acontece se eu parar de pagar?") aparece antes de a pessoa ter conta, ou
 * justamente quando ela não consegue entrar. Ajuda atrás de login só atende
 * quem já não precisa dela.
 *
 * A página existe para reduzir chamado, então a ordem é essa: busca primeiro,
 * temas depois, e o convite para abrir chamado por último — quando as duas
 * primeiras não resolveram. O caminho para o suporte nunca é escondido, mas
 * também não é a primeira coisa que a pessoa vê.
 *
 * Todo o texto vem de `conteudo/ajuda.js`. Esta página só sabe DESENHAR
 * blocos; ela não decide o que está escrito.
 */

export default function AjudaPage() {
  const { slug } = useParams();
  const artigo = slug ? artigoPorSlug(slug) : null;

  // Endereço inventado (/ajuda/qualquer-coisa) não pode virar tela em branco:
  // cai no índice, que é sempre um destino válido.
  const navegar = useNavigate();
  useEffect(() => {
    if (slug && !artigo) navegar('/ajuda', { replace: true });
  }, [slug, artigo, navegar]);

  // Abrir um artigo pelo link do "veja também" precisa começar do topo — sem
  // isso o React Router mantém a rolagem da página anterior e o artigo novo
  // aparece pelo meio.
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  // Título da aba por artigo. Esta é uma página PÚBLICA: o endereço vai ser
  // colado no WhatsApp, salvo nos favoritos e indexado pelo buscador, e nos
  // três casos o que aparece é o <title>. Sem isso, dez artigos diferentes se
  // chamam todos "RevelaCash — Financeiro da família, revelado".
  useEffect(() => {
    const padrao = 'RevelaCash — Financeiro da família, revelado';
    document.title = artigo
      ? `${artigo.titulo} — Ajuda RevelaCash`
      : 'Central de ajuda — RevelaCash';

    return () => { document.title = padrao; };
  }, [artigo]);

  return artigo ? <Artigo artigo={artigo} /> : <Indice />;
}

/* ─────────────────────────────────────────────────────────── moldura */

function Moldura({ children }) {
  return (
    <div className="min-h-screen bg-surface-alt flex flex-col">
      <header className="bg-white border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/"><Logo size="sm" /></Link>
          <div className="flex-1" />
          <Link to="/ajuda" className="text-sm text-muted hover:text-ink hidden sm:inline">
            Central de ajuda
          </Link>
          <Link to="/login" className="text-sm text-muted hover:text-ink ml-4 flex items-center gap-1">
            Entrar <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-white py-8 mt-16">
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link to="/" className="text-muted hover:text-ink">Início</Link>
          <Link to="/ajuda" className="text-muted hover:text-ink">Central de ajuda</Link>
          <Link to="/termos" className="text-muted hover:text-ink">Termos de Uso</Link>
          <Link to="/privacidade" className="text-muted hover:text-ink">Política de Privacidade</Link>
        </div>
        <p className="max-w-6xl mx-auto px-4 text-xs text-faint mt-6 pt-6 border-t border-border">
          LION TECH SOLUÇÕES EM TI LTDA · CNPJ 44.124.574/0001-47 · Mineiros-GO
        </p>
      </footer>
    </div>
  );
}

/** Convite ao suporte. Fecha toda tela da ajuda, nunca abre. */
function AindaComDuvida() {
  return (
    <div className="card flex flex-col sm:flex-row sm:items-center gap-4 mt-12">
      <div className="w-10 h-10 rounded-xl bg-brand-light flex items-center justify-center shrink-0">
        <LifeBuoy className="w-5 h-5 text-brand-dark" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-ink">Não achou o que precisava?</p>
        <p className="text-sm text-muted mt-0.5">
          Abra um chamado pelo painel. A resposta chega no próprio chamado.
        </p>
      </div>
      <Link to="/suporte" className="btn-primary inline-flex items-center gap-2 shrink-0">
        Abrir chamado <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── índice */

function Indice() {
  const [termo, setTermo] = useState('');
  const resultados = useMemo(() => buscarArtigos(termo), [termo]);
  const buscando = termo.trim().length >= 2;

  return (
    <Moldura>
      <section className="max-w-6xl mx-auto px-4 pt-12 sm:pt-16">
        <div className="max-w-2xl">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-ink">Central de ajuda</h1>
          <p className="mt-3 text-muted">
            Como lançar, como organizar e o que fazer quando algo não sai como
            você esperava.
          </p>
        </div>

        <div className="relative mt-8 max-w-2xl">
          <Search className="w-4 h-4 text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar na ajuda: audio, extrato, cancelar..."
            aria-label="Buscar na central de ajuda"
            className="w-full bg-white border border-border rounded-card pl-10 pr-10 py-3 text-sm
                       text-ink placeholder:text-faint focus:border-brand focus:outline-none
                       focus:ring-2 focus:ring-brand/20 transition-colors"
          />
          {termo && (
            <button
              type="button"
              onClick={() => setTermo('')}
              aria-label="Limpar busca"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 mt-10">
        {buscando ? (
          <Resultados termo={termo} resultados={resultados} />
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {TEMAS.map((tema) => (
                <a
                  key={tema.id}
                  href={`#tema-${tema.id}`}
                  className="card hover:shadow-card-hover transition-shadow"
                >
                  <div className="w-10 h-10 rounded-xl bg-brand-light flex items-center justify-center">
                    <tema.icone className="w-5 h-5 text-brand-dark" />
                  </div>
                  <h2 className="mt-3 font-bold text-ink">{tema.titulo}</h2>
                  <p className="mt-1.5 text-sm text-muted">{tema.descricao}</p>
                </a>
              ))}
            </div>

            <div className="mt-16 space-y-12">
              {TEMAS.map((tema) => (
                <div key={tema.id} id={`tema-${tema.id}`} className="scroll-mt-8">
                  <div className="flex items-center gap-2.5">
                    <tema.icone className="w-5 h-5 text-brand" />
                    <h2 className="text-xl font-extrabold text-ink">{tema.titulo}</h2>
                  </div>
                  <div className="mt-4 grid sm:grid-cols-2 gap-3">
                    {artigosDoTema(tema.id).map((artigo) => (
                      <LinhaDeArtigo key={artigo.slug} artigo={artigo} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <AindaComDuvida />
      </section>
    </Moldura>
  );
}

function Resultados({ termo, resultados }) {
  if (!resultados.length) {
    return (
      <div className="card text-center py-12">
        <BookOpen className="w-10 h-10 text-faint mx-auto" />
        <h2 className="mt-3 font-bold text-ink">Nada encontrado para “{termo}”</h2>
        <p className="mt-1.5 text-sm text-muted max-w-md mx-auto">
          Tente uma palavra só, mais simples — “áudio”, “extrato”, “cancelar”.
          Ou percorra os temas abaixo do campo de busca.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-muted">
        {resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'} para “{termo}”
      </p>
      <div className="mt-4 grid sm:grid-cols-2 gap-3">
        {resultados.map((artigo) => (
          <LinhaDeArtigo key={artigo.slug} artigo={artigo} comTema />
        ))}
      </div>
    </>
  );
}

function LinhaDeArtigo({ artigo, comTema = false }) {
  const tema = TEMAS.find((t) => t.id === artigo.tema);

  return (
    <Link
      to={`/ajuda/${artigo.slug}`}
      className="card flex items-start gap-3 hover:shadow-card-hover transition-shadow"
    >
      <div className="min-w-0 flex-1">
        {comTema && tema && (
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
            {tema.titulo}
          </p>
        )}
        <p className="font-semibold text-ink">{artigo.titulo}</p>
        <p className="mt-1 text-sm text-muted">{artigo.resumo}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-faint shrink-0 mt-1" />
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────── artigo */

function Artigo({ artigo }) {
  const tema = TEMAS.find((t) => t.id === artigo.tema);
  const relacionados = (artigo.veja || []).map(artigoPorSlug).filter(Boolean);

  return (
    <Moldura>
      <div className="max-w-6xl mx-auto px-4 py-8 flex gap-10 items-start">
        <NavegacaoLateral atual={artigo.slug} />

        <div className="flex-1 min-w-0 max-w-3xl">
          <nav className="flex items-center gap-1.5 text-xs text-muted" aria-label="Trilha">
            <Link to="/ajuda" className="hover:text-ink">Ajuda</Link>
            <ChevronRight className="w-3 h-3 text-faint" />
            <a href={`/ajuda#tema-${artigo.tema}`} className="hover:text-ink">{tema?.titulo}</a>
          </nav>

          <article className="mt-4 bg-white border border-border rounded-card px-6 py-8 sm:px-10 sm:py-10">
            <h1 className="text-2xl font-extrabold text-ink leading-tight">{artigo.titulo}</h1>
            <p className="mt-2 text-muted">{artigo.resumo}</p>

            <div className="mt-8 space-y-4">
              {artigo.blocos.map((bloco, i) => <Bloco key={i} bloco={bloco} />)}
            </div>
          </article>

          {relacionados.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
                Veja também
              </h2>
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                {relacionados.map((outro) => (
                  <LinhaDeArtigo key={outro.slug} artigo={outro} />
                ))}
              </div>
            </div>
          )}

          <Link to="/ajuda" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink mt-8">
            <ArrowLeft className="w-4 h-4" /> Voltar para a central de ajuda
          </Link>

          <AindaComDuvida />
        </div>
      </div>
    </Moldura>
  );
}

/**
 * Lista de tudo, sempre visível no desktop.
 *
 * Um artigo aberto sem a vizinhança em volta obriga a voltar ao índice a cada
 * pergunta nova — e quem chega da busca do Google cai direto no artigo, sem
 * nunca ter visto o índice.
 */
function NavegacaoLateral({ atual }) {
  return (
    <nav className="hidden lg:block sticky top-8 self-start w-60 shrink-0" aria-label="Artigos da ajuda">
      {TEMAS.map((tema) => (
        <div key={tema.id} className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint mb-1.5">
            {tema.titulo}
          </p>
          <ul className="space-y-0.5 border-l border-border">
            {artigosDoTema(tema.id).map((artigo) => (
              <li key={artigo.slug}>
                <Link
                  to={`/ajuda/${artigo.slug}`}
                  className={`block text-xs leading-snug py-1 pl-3 -ml-px border-l transition-colors
                              ${artigo.slug === atual
                    ? 'border-brand text-brand-dark font-medium'
                    : 'border-transparent text-muted hover:text-ink'}`}
                >
                  {artigo.titulo}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* ─────────────────────────────────────────────────────────── blocos */

function Bloco({ bloco }) {
  switch (bloco.t) {
    case 'sub':
      return <h2 className="text-base font-bold text-ink pt-2">{bloco.texto}</h2>;

    case 'lista':
      return (
        <ul className="space-y-2">
          {bloco.itens.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-ink leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 mt-2" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    case 'passos':
      return (
        <ol className="space-y-2.5">
          {bloco.itens.map((item, i) => (
            <li key={i} className="flex gap-3 text-sm text-ink leading-relaxed">
              <span className="w-5 h-5 rounded-full bg-brand-light text-brand-dark text-xs
                               font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );

    case 'exemplos':
      return (
        <div className="space-y-1.5">
          {bloco.itens.map((item, i) => (
            <p
              key={i}
              className="text-xs font-mono bg-surface-alt border border-border rounded-lg
                         px-3 py-2 text-muted"
            >
              {item}
            </p>
          ))}
        </div>
      );

    case 'atencao':
      return (
        <p className="border-l-2 border-amber-400 bg-amber-50 px-3 py-2 rounded-r text-sm text-ink leading-relaxed">
          {bloco.texto}
        </p>
      );

    case 'tabela':
      return (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-xs border border-border rounded-card overflow-hidden">
            <thead>
              <tr className="bg-surface-alt">
                {bloco.colunas.map((coluna) => (
                  <th key={coluna} className="text-left font-semibold text-ink px-3 py-2 border-b border-border">
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloco.linhas.map((linha, i) => (
                <tr key={i} className="border-b border-border last:border-0 align-top">
                  {linha.map((celula, j) => (
                    <td key={j} className={`px-3 py-2 text-ink ${j === 0 ? 'font-mono whitespace-nowrap' : ''}`}>
                      {celula}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'p':
    default:
      return <p className="text-sm text-ink leading-relaxed">{bloco.texto}</p>;
  }
}
