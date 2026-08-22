import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LifeBuoy, Plus, MessageSquare, ArrowRight, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { useChamados, CATEGORIAS, LIMITE_CARACTERES } from '../hooks/useChamados';
import { Situacao, EscolherAnexos } from '../components/suporte/PecasDoChamado';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatDate } from '../utils/formatters';

/**
 * Lista de chamados de suporte do cliente.
 *
 * A tela existe para responder uma pergunta em um olhar: "alguém já me
 * respondeu?". Por isso o ponto de não lido é a informação mais visível da
 * linha, acima até do assunto.
 */
export default function SuportePage() {
  const { chamados, carregando, listar, abrir } = useChamados();
  const [abrindo, setAbrindo] = useState(false);

  useEffect(() => { listar(); }, [listar]);

  if (carregando && !chamados.length) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-ink flex items-center gap-2">
            <LifeBuoy className="w-6 h-6 text-brand" />
            Suporte
          </h1>
          <p className="mt-1 text-sm text-muted">
            Abra um chamado e acompanhe a resposta por aqui mesmo.
          </p>
          {/* Desvio para a ajuda ANTES do botão de abrir chamado: boa parte do
              que chega aqui já está respondido lá, e resposta imediata é
              melhor que resposta boa daqui a algumas horas. */}
          <a
            href="/ajuda"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-dark hover:underline"
          >
            <BookOpen className="w-4 h-4" />
            Antes disso, veja se a central de ajuda já responde
          </a>
        </div>

        {!abrindo && (
          <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => setAbrindo(true)}>
            <Plus className="w-4 h-4" />
            Abrir chamado
          </button>
        )}
      </div>

      {abrindo && (
        <FormularioDeAbertura
          onCancelar={() => setAbrindo(false)}
          onAbrir={abrir}
          onPronto={() => { setAbrindo(false); listar(); }}
        />
      )}

      {chamados.length === 0 && !abrindo
        ? <Vazio onAbrir={() => setAbrindo(true)} />
        : <Lista chamados={chamados} />}
    </div>
  );
}

function Vazio({ onAbrir }) {
  return (
    <div className="card text-center py-12">
      <MessageSquare className="w-10 h-10 text-faint mx-auto" />
      <h2 className="mt-3 font-bold text-ink">Nenhum chamado por aqui</h2>
      <p className="mt-1.5 text-sm text-muted max-w-md mx-auto">
        Se algo não funcionou como você esperava, ou se ficou uma dúvida sobre a
        cobrança, é só abrir um chamado. A gente responde por aqui.
      </p>
      <button type="button" className="btn-primary mt-4 inline-flex items-center gap-2" onClick={onAbrir}>
        <Plus className="w-4 h-4" />
        Abrir chamado
      </button>
    </div>
  );
}

function Lista({ chamados }) {
  return (
    <div className="card p-0 overflow-hidden">
      <ul>
        {chamados.map((chamado) => (
          <li key={chamado.id} className="border-b border-border last:border-0">
            <Link
              to={`/suporte/${chamado.numero}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt transition-colors"
            >
              {/* O ponto vem antes do texto: é a resposta para "tem novidade?" */}
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${chamado.naoLidoPeloCliente ? 'bg-brand' : 'bg-transparent'}`}
                aria-label={chamado.naoLidoPeloCliente ? 'Resposta não lida' : undefined}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-muted">#{chamado.numero}</span>
                  <span className={`text-sm truncate ${chamado.naoLidoPeloCliente ? 'font-bold text-ink' : 'font-medium text-ink'}`}>
                    {chamado.assunto}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {chamado.quantidadeMensagens} mensagem(ns)
                  {chamado.ultimaMensagemEm ? ` · última em ${formatDate(chamado.ultimaMensagemEm)}` : ''}
                  {chamado.reaberturaDe ? ` · continuação do #${chamado.reaberturaDe}` : ''}
                </p>
              </div>

              <Situacao status={chamado.status} />
              <ArrowRight className="w-4 h-4 text-faint flex-shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormularioDeAbertura({ onAbrir, onCancelar, onPronto }) {
  const [assunto, setAssunto] = useState('');
  const [categoria, setCategoria] = useState('DUVIDA');
  const [texto, setTexto] = useState('');
  const [arquivos, setArquivos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const navegar = useNavigate();

  const podeEnviar = assunto.trim() && texto.trim() && !enviando;

  async function enviar(evento) {
    evento.preventDefault();
    if (!podeEnviar) return;

    setEnviando(true);
    try {
      const criado = await onAbrir({ assunto, categoria, texto, arquivos });
      onPronto();
      navegar(`/suporte/${criado.numero}`);
    } catch (erro) {
      toast.error(erro.response?.data?.error || 'Não consegui abrir o chamado.');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="card space-y-4">
      <h2 className="font-bold text-ink">Novo chamado</h2>

      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <div>
          <label className="label" htmlFor="assunto">Assunto</label>
          <input
            id="assunto"
            className="input"
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
            maxLength={120}
            placeholder="Resuma em uma linha"
            autoFocus
          />
        </div>

        <div>
          <label className="label" htmlFor="categoria">Categoria</label>
          <select id="categoria" className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="texto">O que aconteceu</label>
        <textarea
          id="texto"
          className="input min-h-[120px] resize-y"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={LIMITE_CARACTERES}
          placeholder="Conte com suas palavras. Quanto mais detalhe, menos idas e vindas."
        />
        <p className="mt-1 text-xs text-faint text-right">
          {texto.length}/{LIMITE_CARACTERES}
        </p>
      </div>

      <EscolherAnexos arquivos={arquivos} onMudar={setArquivos} />

      <div className="flex items-center gap-2 justify-end">
        <button type="button" className="btn-secondary" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary" disabled={!podeEnviar}>
          {enviando ? 'Enviando...' : 'Abrir chamado'}
        </button>
      </div>
    </form>
  );
}
