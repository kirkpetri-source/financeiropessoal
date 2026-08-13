import { useState, useEffect } from 'react';
import {
  Loader2, Send, Plus, Trash2, Pencil, Megaphone, Sparkles, Lightbulb, Rss, CheckCircle2, XCircle, ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatDateTime } from '../../utils/formatters';

/**
 * Central de comunicação — templates reutilizáveis e envio em massa pelo
 * WhatsApp para um segmento de famílias (trial vencido, em carência, etc.).
 * Todo envio passa por `POST /plataforma/mensagens/broadcast`, que reaproveita
 * o MESMO canal/registro do bot — nada de infraestrutura de mensagem nova.
 */

const TIPOS = [
  { chave: 'aviso', rotulo: 'Aviso', icon: Megaphone, cor: 'text-amber-700 bg-amber-50 border-amber-200' },
  { chave: 'novidade', rotulo: 'Novidade', icon: Sparkles, cor: 'text-brand-700 bg-brand-50 border-brand-200' },
  { chave: 'dica', rotulo: 'Dica', icon: Lightbulb, cor: 'text-accent-700 bg-accent-50 border-accent-200' },
  { chave: 'atualizacao', rotulo: 'Atualização', icon: Rss, cor: 'text-blue-700 bg-blue-50 border-blue-200' },
];

function rotuloTipo(chave) {
  return TIPOS.find((t) => t.chave === chave)?.rotulo || chave;
}

function IconeTipo({ tipo, className }) {
  const T = TIPOS.find((t) => t.chave === tipo)?.icon || Megaphone;
  return <T className={className} />;
}

function EditorTemplate({ inicial, onSalvar, onCancelar, salvando }) {
  const [titulo, setTitulo] = useState(inicial?.titulo || '');
  const [tipo, setTipo] = useState(inicial?.tipo || 'aviso');
  const [texto, setTexto] = useState(inicial?.texto || '');

  return (
    <div className="card space-y-3 border-brand-200 ring-1 ring-brand-100">
      <div className="grid sm:grid-cols-[1fr_auto] gap-2">
        <input className="input" placeholder="Título do template" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS.map((t) => <option key={t.chave} value={t.chave}>{t.rotulo}</option>)}
        </select>
      </div>
      <textarea className="input" rows={3} placeholder="Texto da mensagem..." value={texto} onChange={(e) => setTexto(e.target.value)} />
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn-secondary text-xs" onClick={onCancelar} disabled={salvando}>Cancelar</button>
        <button
          type="button"
          className="btn-primary text-xs disabled:opacity-50"
          disabled={salvando || !titulo.trim() || !texto.trim()}
          onClick={() => onSalvar({ id: inicial?.id, titulo: titulo.trim(), tipo, texto: texto.trim() })}
        >
          {salvando ? 'Salvando...' : 'Salvar template'}
        </button>
      </div>
    </div>
  );
}

function ConfirmarEnvio({ segmentoRotulo, total, texto, tipo, onConfirmar, onCancelar, enviando }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancelar} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <h3 className="font-semibold text-ink text-sm">Confirmar envio</h3>
        <p className="text-xs text-muted">
          Vai mandar pelo WhatsApp, agora, pra <strong>{total}</strong> família(s) — segmento
          "<strong>{segmentoRotulo}</strong>", tipo <strong>{rotuloTipo(tipo)}</strong>.
        </p>
        <div className="bg-surface-alt rounded-lg p-2.5 text-xs text-ink whitespace-pre-wrap max-h-32 overflow-y-auto">{texto}</div>
        <div className="flex gap-2">
          <button className="btn-secondary flex-1 text-sm" onClick={onCancelar} disabled={enviando}>Cancelar</button>
          <button className="btn-primary flex-1 text-sm disabled:opacity-50" onClick={onConfirmar} disabled={enviando || total === 0}>
            {enviando ? 'Enviando...' : `Enviar para ${total}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function LinhaHistorico({ b }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button type="button" onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-alt">
        <IconeTipo tipo={b.tipo} className="w-4 h-4 text-muted shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink truncate">{b.assunto || b.texto}</p>
          <p className="text-xs text-faint">
            {b.segmento ? `Segmento: ${b.segmento}` : 'Envio individual'} · {formatDateTime(b.createdAt)} · {b.criadoPor}
          </p>
        </div>
        <span className="flex items-center gap-1 text-xs text-green-700 shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /> {b.totalOk}</span>
        {b.totalErro > 0 && (
          <span className="flex items-center gap-1 text-xs text-red-600 shrink-0"><XCircle className="w-3.5 h-3.5" /> {b.totalErro}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-faint transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
          <p className="text-xs text-ink whitespace-pre-wrap bg-surface-alt rounded-lg p-2">{b.texto}</p>
          {b.resultados?.some((r) => !r.ok) && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted">Falharam:</p>
              {b.resultados.filter((r) => !r.ok).map((r) => (
                <p key={r.householdId} className="text-xs text-red-600">{r.householdId}: {r.erro}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ComunicacaoTab() {
  const [segmentos, setSegmentos] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [segmentoEscolhido, setSegmentoEscolhido] = useState('precisam_contato');
  const [tipo, setTipo] = useState('aviso');
  const [assunto, setAssunto] = useState('');
  const [texto, setTexto] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [editandoTemplate, setEditandoTemplate] = useState(null);
  const [criandoTemplate, setCriandoTemplate] = useState(false);
  const [salvandoTemplate, setSalvandoTemplate] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const [seg, tpl, hist] = await Promise.all([
        api.get('/plataforma/segmentos'),
        api.get('/plataforma/mensagens/templates'),
        api.get('/plataforma/mensagens/historico'),
      ]);
      setSegmentos(seg.data.segmentos || []);
      setTemplates(tpl.data.templates || []);
      setHistorico(hist.data.broadcasts || []);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const segmentoInfo = segmentos.find((s) => s.chave === segmentoEscolhido);

  async function salvarTemplate(dados) {
    setSalvandoTemplate(true);
    try {
      if (dados.id) {
        await api.put(`/plataforma/mensagens/templates/${dados.id}`, dados);
      } else {
        await api.post('/plataforma/mensagens/templates', dados);
      }
      toast.success('Template salvo.');
      setEditandoTemplate(null);
      setCriandoTemplate(false);
      await carregar();
    } catch {
      toast.error('Erro ao salvar template.');
    } finally {
      setSalvandoTemplate(false);
    }
  }

  async function apagarTemplate(id) {
    try {
      await api.delete(`/plataforma/mensagens/templates/${id}`);
      await carregar();
    } catch {
      toast.error('Erro ao apagar template.');
    }
  }

  function usarTemplate(t) {
    setTipo(t.tipo);
    setAssunto(t.titulo);
    setTexto(t.texto);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function confirmarEnvio() {
    setEnviando(true);
    try {
      const { data } = await api.post('/plataforma/mensagens/broadcast', {
        texto: texto.trim(), tipo, assunto: assunto.trim() || null, segmento: segmentoEscolhido,
      });
      toast.success(`Enviado: ${data.totalOk} ok${data.totalErro ? `, ${data.totalErro} com erro` : ''}.`);
      setTexto('');
      setAssunto('');
      setConfirmando(false);
      await carregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar broadcast.');
    } finally {
      setEnviando(false);
    }
  }

  if (carregando && !segmentos.length) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-faint" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <p className="text-sm font-semibold text-ink">Nova mensagem</p>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label text-xs">Público</label>
            <select className="input" value={segmentoEscolhido} onChange={(e) => setSegmentoEscolhido(e.target.value)}>
              {segmentos.map((s) => <option key={s.chave} value={s.chave}>{s.rotulo} ({s.total})</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Tipo</label>
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map((t) => <option key={t.chave} value={t.chave}>{t.rotulo}</option>)}
            </select>
          </div>
        </div>

        <input className="input" placeholder="Assunto (só pra identificar no histórico, opcional)" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
        <textarea className="input" rows={4} placeholder="Texto da mensagem que vai pro WhatsApp..." value={texto} onChange={(e) => setTexto(e.target.value)} />

        <div className="flex items-center justify-between">
          <p className="text-xs text-faint">{segmentoInfo?.total ?? 0} família(s) neste público.</p>
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={!texto.trim() || !(segmentoInfo?.total > 0)}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
          >
            <Send className="w-4 h-4" /> Revisar e enviar
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-ink">Templates</p>
          {!criandoTemplate && (
            <button type="button" className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => setCriandoTemplate(true)}>
              <Plus className="w-3.5 h-3.5" /> Novo template
            </button>
          )}
        </div>

        {criandoTemplate && (
          <div className="mb-3">
            <EditorTemplate salvando={salvandoTemplate} onCancelar={() => setCriandoTemplate(false)} onSalvar={salvarTemplate} />
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          {templates.map((t) => (
            editandoTemplate?.id === t.id ? (
              <EditorTemplate key={t.id} inicial={t} salvando={salvandoTemplate} onCancelar={() => setEditandoTemplate(null)} onSalvar={salvarTemplate} />
            ) : (
              <div key={t.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <IconeTipo tipo={t.tipo} className="w-3.5 h-3.5 text-muted shrink-0" />
                    <p className="text-sm font-medium text-ink truncate">{t.titulo}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => setEditandoTemplate(t)} className="text-faint hover:text-ink"><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => apagarTemplate(t.id)} className="text-faint hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <p className="text-xs text-muted line-clamp-3">{t.texto}</p>
                <button type="button" onClick={() => usarTemplate(t)} className="text-xs font-medium text-brand-700 hover:underline">Usar no compositor</button>
              </div>
            )
          ))}
          {templates.length === 0 && !criandoTemplate && (
            <p className="text-xs text-faint sm:col-span-2">Nenhum template salvo ainda — mensagens de aviso de trial vencido, dicas de uso, novidades... salve aqui pra reusar depois.</p>
          )}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-ink mb-2">Histórico de envios</p>
        {historico.length === 0 ? (
          <p className="text-xs text-faint">Nenhum envio ainda.</p>
        ) : (
          <div className="space-y-2">
            {historico.map((b) => <LinhaHistorico key={b.id} b={b} />)}
          </div>
        )}
      </div>

      {confirmando && (
        <ConfirmarEnvio
          segmentoRotulo={segmentoInfo?.rotulo || segmentoEscolhido}
          total={segmentoInfo?.total ?? 0}
          texto={texto}
          tipo={tipo}
          enviando={enviando}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={confirmarEnvio}
        />
      )}
    </div>
  );
}
