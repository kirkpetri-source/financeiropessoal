import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Trash2, ChevronDown, Info } from 'lucide-react';
import { useAssistente } from '../hooks/useAssistente';
import LoadingSpinner from '../components/ui/LoadingSpinner';

/**
 * Conversa com a assistente de finanças.
 *
 * Coluna única, do jeito que qualquer app de conversa funciona — a resposta
 * precisa de espaço porque quase sempre traz números e comparações, e o mesmo
 * layout serve no celular sem virar outra coisa.
 *
 * Duas decisões que valem lembrar:
 *
 * - O uso do dia aparece como PORCENTAGEM, não como "8 de 20". Porcentagem
 *   informa folga; contagem regressiva transforma conversa em racionamento.
 * - Cada resposta traz "ver de onde veio", que abre as consultas realmente
 *   feitas ao banco. É o que separa uma resposta ancorada em dado de um
 *   palpite convincente — e num assunto como dinheiro isso importa.
 */

const SUGESTOES = [
  'Como foi meu mês?',
  'Onde gastei mais?',
  'Comparar com o mês passado',
  'Como posso diminuir minhas despesas?',
];

const NOMES_DAS_CONSULTAS = {
  resumoDoMes: 'Resumo do mês',
  gastoPorCategoria: 'Gastos por categoria',
  gastoPorSubcategoria: 'Gastos por subcategoria',
  compararPeriodos: 'Comparação entre meses',
  listarLancamentos: 'Lista de lançamentos',
  contasFixasEOrcamento: 'Contas fixas e orçamento',
  retratoFinanceiro: 'Retrato dos últimos meses',
  listarCategorias: 'Suas categorias',
  listarSubcategorias: 'Suas subcategorias',
  registrarLancamento: 'Registro de lançamento',
  prepararAlteracao: 'Proposta de alteração',
  prepararExclusao: 'Proposta de exclusão',
  confirmarAcaoPendente: 'Confirmação da alteração',
  cancelarAcaoPendente: 'Cancelamento',
};

function MedidorDeUso({ uso }) {
  if (!uso || typeof uso.percentual !== 'number') return null;

  const alto = uso.percentual >= 70;

  return (
    <div className="text-right flex-shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Uso hoje</p>
      <div className="w-24 h-1.5 bg-surface-alt border border-border rounded-full mt-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${alto ? 'bg-amber-500' : 'bg-accent'}`}
          style={{ width: `${Math.max(uso.percentual, 2)}%` }}
        />
      </div>
      <p className="text-[11px] font-mono text-muted mt-1">{uso.percentual}%</p>
    </div>
  );
}

function DeOndeVeio({ consultas }) {
  const [aberto, setAberto] = useState(false);
  const lista = useRef(null);

  // Sem isto a lista abre logo acima do campo de digitação e nasce cortada
  // pela borda da área rolável — a pessoa clica e parece que nada apareceu.
  useEffect(() => {
    if (aberto) lista.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [aberto]);

  if (!consultas?.length) return null;

  const unicas = [...new Set(consultas)];

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="inline-flex items-center gap-1 text-[11px] text-faint hover:text-muted transition-colors"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        Ver de onde veio
      </button>

      {aberto && (
        <ul ref={lista} className="mt-1.5 pl-4 space-y-1 pb-1">
          {unicas.map((c) => (
            <li key={c} className="text-[11px] text-muted flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-accent flex-shrink-0" />
              {NOMES_DAS_CONSULTAS[c] || c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Renderiza a resposta da assistente com o markdown simples que ela usa:
 * **negrito** e listas com hífen ou bolinha.
 *
 * Escrito à mão, sem biblioteca, por dois motivos. Primeiro, o repertório é
 * minúsculo — o prompt manda usar só negrito e lista, e uma dependência de
 * markdown completo pesaria mais que a página inteira. Segundo, e mais
 * importante: aqui só se produzem elementos React, nunca HTML cru. O texto vem
 * de um modelo de linguagem que, por sua vez, recebeu descrições escritas pelo
 * próprio usuário — `dangerouslySetInnerHTML` nesse caminho seria uma porta de
 * XSS aberta de graça.
 */
function TextoFormatado({ texto }) {
  const linhas = String(texto || '').split('\n');

  const negrito = (linha, chaveBase) =>
    linha.split(/\*\*(.+?)\*\*/g).map((parte, i) => (
      // Índices ímpares são o conteúdo capturado entre os asteriscos.
      i % 2 === 1
        ? <strong key={`${chaveBase}-${i}`} className="font-semibold">{parte}</strong>
        : parte
    ));

  return (
    <div className="space-y-1">
      {linhas.map((linha, i) => {
        const limpa = linha.trim();

        if (!limpa) return <div key={i} className="h-1.5" />;

        const item = limpa.match(/^[-•*]\s+(.*)$/);
        if (item) {
          return (
            <div key={i} className="flex gap-2 pl-0.5">
              <span className="text-faint select-none flex-shrink-0">•</span>
              <span>{negrito(item[1], i)}</span>
            </div>
          );
        }

        return <div key={i}>{negrito(limpa, i)}</div>;
      })}
    </div>
  );
}

function Bolha({ mensagem }) {
  const minha = mensagem.autor === 'eu';

  if (minha) {
    return (
      <div className="flex justify-end">
        <div className="bg-brand text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm max-w-[80%] whitespace-pre-wrap">
          {mensagem.texto}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-brand-light flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-brand-dark" />
      </div>
      <div className="max-w-[80%]">
        <div
          className={`rounded-2xl rounded-bl-md px-4 py-2.5 text-sm border leading-relaxed ${
            mensagem.ehAviso
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-surface border-border text-ink'
          }`}
        >
          <TextoFormatado texto={mensagem.texto} />
        </div>
        {!mensagem.ehAviso && <DeOndeVeio consultas={mensagem.consultasUsadas} />}
      </div>
    </div>
  );
}

function Pensando() {
  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-brand-light flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-brand-dark" />
      </div>
      <div className="bg-surface border border-border rounded-2xl rounded-bl-md px-4 py-2.5 flex items-center gap-2">
        <span className="flex gap-1" aria-hidden="true">
          <span className="w-1.5 h-1.5 rounded-full bg-brand/30 animate-pulse" />
          <span className="w-1.5 h-1.5 rounded-full bg-brand/60 animate-pulse [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse [animation-delay:300ms]" />
        </span>
        <span className="text-xs text-muted">consultando seus dados…</span>
      </div>
    </div>
  );
}

function Vazio({ onSugestao }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
      <div className="w-14 h-14 rounded-2xl bg-brand-light flex items-center justify-center">
        <Sparkles className="w-6 h-6 text-brand-dark" />
      </div>
      <h2 className="mt-4 font-bold text-lg">Pergunte sobre seus gastos</h2>
      <p className="mt-1.5 text-sm text-muted max-w-sm">
        Ela enxerga só os lançamentos da sua família e responde com os números reais.
      </p>

      <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-lg">
        {SUGESTOES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSugestao(s)}
            className="border border-border bg-surface rounded-full px-3.5 py-1.5 text-xs text-muted hover:text-ink hover:border-border-strong transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AssistentePage() {
  const { mensagens, pensando, uso, carregando, indisponivel, perguntar, limpar } = useAssistente();
  const [rascunho, setRascunho] = useState('');
  const fim = useRef(null);

  // Só rola quando há conversa. Rolar com a tela vazia empurra o convite
  // inicial para fora do quadro e ele aparece cortado no topo.
  useEffect(() => {
    if (!mensagens.length && !pensando) return;
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensagens, pensando]);

  const enviar = (texto) => {
    const conteudo = texto ?? rascunho;
    if (!conteudo.trim() || pensando) return;
    setRascunho('');
    perguntar(conteudo);
  };

  if (carregando) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  }

  if (indisponivel) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <Info className="w-8 h-8 text-muted mx-auto" />
        <p className="mt-3 text-muted">{indisponivel}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      <header className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-bold text-base leading-tight">Nina</h1>
          <p className="text-xs text-muted truncate">Assistente das suas finanças</p>
        </div>

        <MedidorDeUso uso={uso} />

        {mensagens.length > 0 && (
          <button
            type="button"
            onClick={limpar}
            title="Começar uma conversa nova"
            className="p-2 text-faint hover:text-muted transition-colors flex-shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto py-5 space-y-4">
        {mensagens.length === 0 && !pensando
          ? <Vazio onSugestao={enviar} />
          : mensagens.map((m) => <Bolha key={m.id} mensagem={m} />)}
        {pensando && <Pensando />}
        <div ref={fim} />
      </div>

      <div className="border-t border-border pt-3.5 pb-1">
        <form
          onSubmit={(e) => { e.preventDefault(); enviar(); }}
          className="flex items-center gap-2.5 bg-surface border border-border-strong rounded-xl pl-4 pr-2.5 py-2 focus-within:border-accent transition-colors"
        >
          <input
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            placeholder="Pergunte sobre suas finanças…"
            maxLength={1000}
            disabled={pensando}
            className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-faint disabled:text-muted"
          />
          <button
            type="submit"
            disabled={!rascunho.trim() || pensando}
            aria-label="Enviar pergunta"
            className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center flex-shrink-0 disabled:bg-border transition-colors"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </form>

        <p className="text-[11px] text-faint text-center mt-2.5">
          A Nina enxerga só os dados da sua família. Não é recomendação de investimento.
        </p>
      </div>
    </div>
  );
}
