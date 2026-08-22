import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, AlertTriangle, Headset, User, Send, CheckCircle2,
  CornerUpRight, RefreshCw, Inbox,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { AnexosDaMensagem } from '../../components/suporte/PecasDoChamado';

/**
 * Fila de atendimento.
 *
 * A ordem da lista não é escolha de tela: vem do backend, por
 * `aguardandoOperadorDesde` — quem espera há mais tempo primeiro. Ordenar por
 * "mais recente" colocaria em cima justamente quem acabou de ser respondido.
 *
 * Por isso a coluna que mais importa em cada linha é o TEMPO DE ESPERA, e não
 * a data da última mensagem.
 */

const FILTROS = [
  { chave: '', rotulo: 'Todos' },
  { chave: 'ABERTO', rotulo: 'Abertos' },
  { chave: 'EM_ANDAMENTO', rotulo: 'Em andamento' },
  { chave: 'AGUARDANDO_CLIENTE', rotulo: 'Com o cliente' },
  { chave: 'RESOLVIDO', rotulo: 'Resolvidos' },
];

const ROTULO_STATUS = {
  ABERTO: 'Aberto',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_CLIENTE: 'Com o cliente',
  RESOLVIDO: 'Resolvido',
};

function Situacao({ status }) {
  const tons = {
    ABERTO: 'bg-red-50 text-red-600',
    EM_ANDAMENTO: 'bg-brand-light text-brand-dark',
    AGUARDANDO_CLIENTE: 'bg-surface-alt text-muted',
    RESOLVIDO: 'bg-emerald-50 text-emerald-700',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tons[status] || tons.ABERTO}`}>
      {ROTULO_STATUS[status] || status}
    </span>
  );
}

/**
 * Há quanto tempo esperando.
 *
 * Em horas até um dia, depois em dias. "há 37 horas" não diz nada a ninguém;
 * "há 2 dias" diz que alguém está esperando desde anteontem.
 */
function esperaLegivel(desde) {
  if (!desde) return null;

  const minutos = Math.floor((Date.now() - new Date(desde).getTime()) / 60000);
  if (minutos < 60) return `há ${Math.max(minutos, 1)} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;

  return `há ${Math.floor(horas / 24)} dia(s)`;
}

function dataCurta(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
}

export default function ChamadosTab() {
  const [fila, setFila] = useState({ chamados: [], total: 0, abertos: 0, naoLidos: 0, truncada: false });
  const [avisos, setAvisos] = useState([]);
  const [operadores, setOperadores] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [numeroAberto, setNumeroAberto] = useState(null);

  const carregar = useCallback(async (status = filtro) => {
    setCarregando(true);
    try {
      const [f, a, o] = await Promise.all([
        api.get('/plataforma/chamados', { params: status ? { status } : {} }),
        api.get('/plataforma/chamados/avisos'),
        api.get('/plataforma/chamados/operadores'),
      ]);
      setFila(f.data);
      setAvisos(a.data);
      setOperadores(o.data);
    } catch {
      toast.error('Não consegui carregar a fila.');
    } finally {
      setCarregando(false);
    }
  }, [filtro]);

  useEffect(() => { carregar(filtro); }, [filtro, carregar]);

  return (
    <div className="space-y-4">
      <Cabecalho fila={fila} onRecarregar={() => carregar(filtro)} carregando={carregando} />

      {avisos.length > 0 && <AvisosNaoEntregues avisos={avisos} onBaixa={() => carregar(filtro)} />}

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.chave || 'todos'}
            type="button"
            onClick={() => setFiltro(f.chave)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors
                        ${filtro === f.chave
              ? 'border-brand bg-brand-light text-brand-dark font-medium'
              : 'border-border bg-white text-muted hover:text-ink'}`}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      {fila.truncada && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          A fila tem {fila.total} chamados e a tela está mostrando os {fila.chamados.length} que
          esperam há mais tempo. Passou a hora de paginar de verdade.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr] items-start">
        <ListaDaFila
          chamados={fila.chamados}
          carregando={carregando}
          numeroAberto={numeroAberto}
          onAbrir={setNumeroAberto}
        />

        {numeroAberto
          ? (
            <Detalhe
              numero={numeroAberto}
              operadores={operadores}
              onMudou={() => carregar(filtro)}
              onFechar={() => setNumeroAberto(null)}
            />
          )
          : (
            <div className="card text-center py-16 hidden lg:block">
              <Inbox className="w-8 h-8 text-faint mx-auto" />
              <p className="mt-2 text-sm text-muted">Escolha um chamado na fila.</p>
            </div>
          )}
      </div>
    </div>
  );
}

function Cabecalho({ fila, onRecarregar, carregando }) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-4">
        <Numero rotulo="Na fila" valor={fila.total} />
        <Numero rotulo="Em aberto" valor={fila.abertos} />
        <Numero rotulo="Não lidos" valor={fila.naoLidos} destaque={fila.naoLidos > 0} />
      </div>

      <button
        type="button"
        onClick={onRecarregar}
        className="btn-secondary text-sm flex items-center gap-2"
        disabled={carregando}
      >
        <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
        Atualizar
      </button>
    </div>
  );
}

function Numero({ rotulo, valor, destaque }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{rotulo}</p>
      <p className={`text-2xl font-bold ${destaque ? 'text-brand' : 'text-ink'}`}>{valor ?? 0}</p>
    </div>
  );
}

/**
 * Avisos que não chegaram ao cliente nem à equipe.
 *
 * Fica no topo, e não escondido numa aba: uma notificação que falhou significa
 * alguém esperando resposta sem saber que ela existe. Erro só no log some, e
 * era exatamente isso que este bloco existe para impedir.
 */
function AvisosNaoEntregues({ avisos, onBaixa }) {
  const [dando, setDando] = useState(null);

  async function darBaixa(id) {
    setDando(id);
    try {
      await api.post(`/plataforma/chamados/avisos/${id}/baixa`);
      toast.success('Aviso baixado.');
      await onBaixa();
    } catch {
      toast.error('Não consegui dar baixa.');
    } finally {
      setDando(null);
    }
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <AlertTriangle className="w-4 h-4" />
        {avisos.length} aviso(s) não chegaram ao destino
      </p>

      <ul className="mt-2 space-y-1.5">
        {avisos.map((aviso) => (
          <li key={aviso.id} className="flex items-center gap-2 text-xs text-amber-900">
            <span className="font-mono">#{aviso.numero}</span>
            <span className="uppercase">{aviso.canal}</span>
            <span className="truncate flex-1">{aviso.destinatario} — {aviso.erro}</span>
            <button
              type="button"
              onClick={() => darBaixa(aviso.id)}
              disabled={dando === aviso.id}
              className="underline hover:no-underline flex-shrink-0"
            >
              {dando === aviso.id ? 'baixando...' : 'já resolvi'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListaDaFila({ chamados, carregando, numeroAberto, onAbrir }) {
  if (carregando && !chamados.length) {
    return <div className="card flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-faint" /></div>;
  }

  if (!chamados.length) {
    return (
      <div className="card text-center py-12">
        <CheckCircle2 className="w-8 h-8 text-income mx-auto" />
        <p className="mt-2 text-sm font-medium text-ink">Fila vazia</p>
        <p className="text-xs text-muted">Ninguém esperando resposta.</p>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <ul>
        {chamados.map((chamado) => {
          const espera = esperaLegivel(chamado.aguardandoOperadorDesde);
          const ativo = numeroAberto === chamado.numero;

          return (
            <li key={chamado.id} className="border-b border-border last:border-0">
              <button
                type="button"
                onClick={() => onAbrir(chamado.numero)}
                className={`w-full text-left px-3 py-2.5 transition-colors
                            ${ativo ? 'bg-brand-light' : 'hover:bg-surface-alt'}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${chamado.naoLidoPeloOperador ? 'bg-brand' : 'bg-transparent'}`}
                  />
                  <span className="font-mono text-xs text-muted">#{chamado.numero}</span>
                  <span className={`text-sm truncate flex-1 ${chamado.naoLidoPeloOperador ? 'font-bold text-ink' : 'text-ink'}`}>
                    {chamado.assunto}
                  </span>
                </div>

                <div className="mt-1 flex items-center gap-2 pl-4">
                  <Situacao status={chamado.status} />
                  {/* O tempo de espera é a informação que decide o que atender
                      primeiro — por isso ele fica aqui, e não a data. */}
                  {espera
                    ? <span className="text-xs text-expense font-medium">esperando {espera}</span>
                    : <span className="text-xs text-faint">{dataCurta(chamado.ultimaMensagemEm)}</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Detalhe({ numero, operadores, onMudou, onFechar }) {
  const [chamado, setChamado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [agindo, setAgindo] = useState(false);
  const campo = useRef(null);

  const buscar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await api.get(`/plataforma/chamados/${numero}`);
      setChamado(data);
    } catch {
      toast.error('Não consegui abrir este chamado.');
    } finally {
      setCarregando(false);
    }
  }, [numero]);

  useEffect(() => { buscar(); }, [buscar]);

  async function responder(evento) {
    evento.preventDefault();
    if (!texto.trim() || enviando) return;

    setEnviando(true);
    try {
      await api.post(`/plataforma/chamados/${numero}/mensagens`, { texto });
      setTexto('');
      await buscar();
      await onMudou();
    } catch (erro) {
      toast.error(erro.response?.data?.error || 'Não consegui enviar.');
    } finally {
      setEnviando(false);
      // Foco de volta: quem acaba de responder costuma ter mais a dizer, e
      // caçar o campo com o mouse a cada mensagem cansa.
      campo.current?.focus();
    }
  }

  async function encaminhar(paraUid) {
    if (!paraUid) return;
    setAgindo(true);
    try {
      const { data } = await api.post(`/plataforma/chamados/${numero}/encaminhar`, { paraUid });
      toast.success(`Encaminhado para ${data.paraNome || 'o operador'}.`);
      await buscar();
      await onMudou();
    } catch (erro) {
      toast.error(erro.response?.data?.error || 'Não consegui encaminhar.');
    } finally {
      setAgindo(false);
    }
  }

  async function resolver() {
    setAgindo(true);
    try {
      await api.post(`/plataforma/chamados/${numero}/resolver`);
      toast.success('Chamado resolvido.');
      await buscar();
      await onMudou();
    } catch {
      toast.error('Não consegui resolver.');
    } finally {
      setAgindo(false);
    }
  }

  if (carregando) {
    return <div className="card flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-faint" /></div>;
  }
  if (!chamado) return null;

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <span className="font-mono text-xs text-muted">#{chamado.numero}</span>
            <h3 className="font-bold text-ink">{chamado.assunto}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {chamado.categoria} · família <span className="font-mono">{chamado.householdId}</span>
              {chamado.atribuidoNome ? ` · com ${chamado.atribuidoNome}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Situacao status={chamado.status} />
            <button type="button" onClick={onFechar} className="text-xs text-muted hover:text-ink lg:hidden">
              fechar
            </button>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2">
          <select
            className="input text-sm py-1.5 w-auto"
            value=""
            disabled={agindo}
            onChange={(e) => encaminhar(e.target.value)}
          >
            <option value="">Encaminhar para...</option>
            {operadores
              .filter((o) => o.uid !== chamado.atribuidoA)
              .map((o) => <option key={o.uid} value={o.uid}>{o.nome}</option>)}
          </select>

          {chamado.status !== 'RESOLVIDO' && (
            <button
              type="button"
              onClick={resolver}
              disabled={agindo}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Marcar resolvido
            </button>
          )}
        </div>
      </div>

      <Conversa mensagens={chamado.mensagens} numero={numero} />

      <form onSubmit={responder} className="card space-y-3">
        <textarea
          ref={campo}
          className="input min-h-[88px] resize-y"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={5000}
          placeholder="Responder ao cliente"
        />
        <div className="flex justify-end">
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={!texto.trim() || enviando}>
            <Send className="w-4 h-4" />
            {enviando ? 'Enviando...' : 'Responder'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Conversa({ mensagens, numero }) {
  /**
   * Baixa autenticado, igual ao lado cliente: sem URL pública nem link
   * assinado, o arquivo vem pelo Bearer do operador e vira blob local.
   */
  async function baixar(anexo) {
    try {
      const resposta = await api.get(`/plataforma/chamados/${numero}/anexos/${anexo.id}`, {
        responseType: 'blob',
      });

      const url = URL.createObjectURL(resposta.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = anexo.nomeOriginal || 'anexo';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Não consegui baixar este anexo.');
    }
  }

  return (
    <div className="space-y-2.5">
      {(mensagens || []).map((mensagem) => {
        const doSuporte = mensagem.autor === 'SUPORTE';

        return (
          <div key={mensagem.id} className={`flex gap-2.5 ${doSuporte ? 'flex-row-reverse' : ''}`}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                          ${doSuporte ? 'bg-brand-light' : 'bg-surface-alt'}`}
            >
              {doSuporte
                ? <Headset className="w-4 h-4 text-brand-dark" />
                : <User className="w-4 h-4 text-muted" />}
            </div>

            <div className="min-w-0 max-w-[85%]">
              <div className={`rounded-xl px-3 py-2 border border-border ${doSuporte ? 'bg-brand-light' : 'bg-white'}`}>
                <p className="text-xs text-muted mb-1">
                  {doSuporte ? (mensagem.autorNome || 'Suporte') : (mensagem.autorNome || 'Cliente')}
                  {' · '}
                  {mensagem.em ? new Date(mensagem.em).toLocaleString('pt-BR') : ''}
                </p>
                <p className="text-sm text-ink whitespace-pre-wrap break-words">{mensagem.texto}</p>
                <AnexosDaMensagem anexos={mensagem.anexos} onBaixar={baixar} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { CornerUpRight };
