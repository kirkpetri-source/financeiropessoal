import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, RefreshCw, X, ShieldOff, ShieldCheck, Gift, RotateCcw, Ban, HandCoins, Trash2,
  Search, StickyNote, MessageCircle, Send, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { formatarParaLeitura } from '../../utils/telefone';
import { SEGMENTOS_CLIENTE, pertenceAoSegmentoCliente } from './segmentos';

/**
 * Aba "Clientes" do CRM do operador — a mesma lista/ações administrativas que
 * já existiam, com busca, filtro por segmento, e o drawer da família ganhando
 * duas abas novas: Notas (CRM) e Mensagens (histórico do WhatsApp + envio
 * avulso). Nenhuma ação já existente (pagamento manual, bloquear, cancelar,
 * apagar) mudou de rota nem de comportamento — só o entorno.
 */

const CORES_DO_STATUS = {
  active: 'bg-green-100 text-green-800',
  trialing: 'bg-blue-100 text-blue-800',
  past_due: 'bg-red-100 text-red-800',
  pending: 'bg-amber-100 text-amber-800',
  canceled: 'bg-surface-alt text-muted',
  paused: 'bg-surface-alt text-muted',
};

function AcaoBtn({ icon: Icon, children, onClick, loading, tone = 'default' }) {
  const cores = {
    default: 'border-border-strong text-ink hover:bg-surface-alt',
    danger: 'border-red-200 text-red-700 hover:bg-red-50',
    good: 'border-green-200 text-green-700 hover:bg-green-50',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${cores[tone]}`}
    >
      <Icon className="w-3.5 h-3.5" /> {children}
    </button>
  );
}

function PedirMotivo({ titulo, onConfirmar, onCancelar, loading }) {
  const [motivo, setMotivo] = useState('');
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancelar} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <h3 className="font-semibold text-ink text-sm">{titulo}</h3>
        <textarea
          className="input"
          rows={3}
          placeholder="Motivo (aparece na auditoria)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
        <div className="flex gap-2">
          <button className="btn-secondary flex-1 text-sm" onClick={onCancelar} disabled={loading}>Cancelar</button>
          <button className="btn-danger flex-1 text-sm" onClick={() => onConfirmar(motivo)} disabled={loading}>
            {loading ? 'Aplicando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmarExclusao({ nomeFamilia, onConfirmar, onCancelar, loading }) {
  const [digitado, setDigitado] = useState('');
  const [motivo, setMotivo] = useState('');
  const alvo = nomeFamilia?.trim() || 'APAGAR';
  const confere = digitado === alvo;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancelar} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <h3 className="font-semibold text-red-700 text-sm">Apagar "{alvo}" agora</h3>
        <p className="text-xs text-muted">
          Sem prazo de arrependimento, sem "desfazer". Apaga lançamentos, canal do
          WhatsApp e contas de login de quem só participava desta família.
        </p>
        <div>
          <label className="label text-xs">
            Digite <strong>{alvo}</strong> para confirmar
          </label>
          <input className="input" value={digitado} onChange={(e) => setDigitado(e.target.value)} autoFocus />
        </div>
        <textarea
          className="input"
          rows={2}
          placeholder="Motivo (opcional, aparece na auditoria)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
        <div className="flex gap-2">
          <button className="btn-secondary flex-1 text-sm" onClick={onCancelar} disabled={loading}>Cancelar</button>
          <button
            className="btn-danger flex-1 text-sm disabled:opacity-40"
            onClick={() => onConfirmar({ confirmarNome: digitado, motivo })}
            disabled={loading || !confere}
          >
            {loading ? 'Apagando...' : 'Apagar para sempre'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Aba "Notas" do drawer — anotações livres do operador sobre a família. */
function AbaNotas({ familiaId }) {
  const [notas, setNotas] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    const { data } = await api.get(`/plataforma/familias/${familiaId}/notas`);
    setNotas(data.notas || []);
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [familiaId]);

  async function adicionar() {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await api.post(`/plataforma/familias/${familiaId}/notas`, { texto: texto.trim() });
      setTexto('');
      await carregar();
    } catch {
      toast.error('Erro ao salvar nota.');
    } finally {
      setEnviando(false);
    }
  }

  async function apagar(notaId) {
    try {
      await api.delete(`/plataforma/familias/${familiaId}/notas/${notaId}`);
      await carregar();
    } catch {
      toast.error('Erro ao apagar nota.');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea
          className="input flex-1"
          rows={2}
          placeholder="Ex.: ligou reclamando de X, pediu desconto, vai cancelar se não resolver Y..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <button
          type="button"
          onClick={adicionar}
          disabled={enviando || !texto.trim()}
          className="btn-primary text-xs px-3 self-start disabled:opacity-50"
        >
          {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>

      {notas === null ? (
        <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-faint" /></div>
      ) : notas.length === 0 ? (
        <p className="text-xs text-faint text-center py-4">Nenhuma nota ainda.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {notas.map((n) => (
            <div key={n.id} className="bg-surface-alt rounded-lg p-2.5 group relative">
              <p className="text-xs text-ink whitespace-pre-wrap pr-5">{n.texto}</p>
              <p className="text-[10px] text-faint mt-1">{n.criadoPor} · {formatDateTime(n.createdAt)}</p>
              <button
                type="button"
                onClick={() => apagar(n.id)}
                className="absolute top-2 right-2 text-faint hover:text-red-600 opacity-0 group-hover:opacity-100"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Aba "Mensagens" do drawer — histórico do WhatsApp da família + envio avulso. */
function AbaMensagens({ familiaId }) {
  const [logs, setLogs] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    try {
      const { data } = await api.get(`/plataforma/familias/${familiaId}/mensagens`, { params: { limit: 80 } });
      setLogs(data.logs || []);
    } catch {
      setLogs([]);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [familiaId]);

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await api.post(`/plataforma/familias/${familiaId}/enviar-mensagem`, { texto: texto.trim() });
      toast.success('Mensagem enviada.');
      setTexto('');
      await carregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar mensagem. Confira se o canal está conectado.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Mensagem avulsa pro WhatsApp desta família..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enviar()}
        />
        <button
          type="button"
          onClick={enviar}
          disabled={enviando || !texto.trim()}
          className="btn-primary text-xs px-3 disabled:opacity-50"
        >
          {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>

      {logs === null ? (
        <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-faint" /></div>
      ) : logs.length === 0 ? (
        <p className="text-xs text-faint text-center py-4">Sem mensagens registradas ainda.</p>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {[...logs].reverse().map((l) => {
            const daCasa = l.sender === 'sistema';
            return (
              <div key={l.id} className={`flex ${daCasa ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-1.5 text-xs ${daCasa ? 'bg-brand-700 text-white' : 'bg-surface-alt text-ink'}`}>
                  <p className="whitespace-pre-wrap">{l.content || <em className="opacity-60">({l.messageType || 'mídia'})</em>}</p>
                  <p className={`text-[10px] mt-0.5 ${daCasa ? 'text-white/70' : 'text-faint'}`}>
                    {daCasa ? 'Nós' : (l.sender || 'cliente')} · {formatDateTime(l.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetalheFamilia({ familiaId, onClose, onMudou }) {
  const [detalhe, setDetalhe] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [acaoEmCurso, setAcaoEmCurso] = useState(null);
  const [pedindoMotivoPara, setPedindoMotivoPara] = useState(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [aba, setAba] = useState('geral');

  async function carregar() {
    setCarregando(true);
    try {
      const { data } = await api.get(`/plataforma/familias/${familiaId}`);
      setDetalhe(data);
    } catch {
      toast.error('Erro ao carregar detalhe da família.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [familiaId]);

  async function executar(acao, body = {}) {
    setAcaoEmCurso(acao);
    try {
      await api.post(`/plataforma/familias/${familiaId}/${acao}`, body);
      toast.success('Feito.');
      await carregar();
      onMudou?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao executar ação.');
    } finally {
      setAcaoEmCurso(null);
      setPedindoMotivoPara(null);
    }
  }

  async function apagarAgora({ confirmarNome, motivo }) {
    setAcaoEmCurso('apagar-agora');
    try {
      const { data } = await api.post(`/plataforma/familias/${familiaId}/apagar-agora`, {
        confirmarNome, motivo: motivo || null,
      });
      toast.success('Família apagada.');
      if (data.avisoWhatsapp) {
        toast(data.avisoWhatsapp, { icon: '⚠️', duration: 12000 });
      }
      setConfirmandoExclusao(false);
      onClose();
      onMudou?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao apagar a família.');
    } finally {
      setAcaoEmCurso(null);
    }
  }

  const s = detalhe?.subscription;
  const bloqueada = !!s?.adminOverride?.blocked;
  const interna = s?.plan === 'interno';
  const dono = detalhe?.membros?.find((m) => m.role === 'owner');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">
              {dono?.name || detalhe?.nome || 'Família'}
              {dono?.phone && <span className="text-faint font-normal"> · {formatarParaLeitura(dono.phone)}</span>}
            </h2>
            <p className="text-xs text-faint">{detalhe?.nome || 'sem nome de família'}</p>
          </div>
          <button onClick={onClose} className="text-faint hover:text-ink"><X className="w-5 h-5" /></button>
        </div>

        {carregando || !detalhe ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-faint" /></div>
        ) : (
          <>
            <div className="flex gap-1 border-b border-border">
              {[
                { chave: 'geral', rotulo: 'Visão geral' },
                { chave: 'notas', rotulo: 'Notas', icon: StickyNote },
                { chave: 'mensagens', rotulo: 'Mensagens', icon: MessageCircle },
              ].map((t) => (
                <button
                  key={t.chave}
                  type="button"
                  onClick={() => setAba(t.chave)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${aba === t.chave ? 'border-brand-700 text-brand-700' : 'border-transparent text-muted hover:text-ink'}`}
                >
                  {t.icon && <t.icon className="w-3.5 h-3.5" />} {t.rotulo}
                </button>
              ))}
            </div>

            {aba === 'notas' && <AbaNotas familiaId={familiaId} />}
            {aba === 'mensagens' && <AbaMensagens familiaId={familiaId} />}

            {aba === 'geral' && (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-faint text-xs">Status</p><p className="text-ink">{s?.status || '—'} {bloqueada && <span className="text-red-600">(bloqueada)</span>}</p></div>
                  <div><p className="text-faint text-xs">Plano</p><p className="text-ink">{s?.plan || '—'}{interna ? ' (interna)' : ''}</p></div>
                  <div><p className="text-faint text-xs">Provedor</p><p className="text-ink">{s?.provider || '—'}</p></div>
                  <div><p className="text-faint text-xs">Vence em</p><p className="text-ink">{detalhe.situacao?.expiraEm ? formatDate(detalhe.situacao.expiraEm) : '—'}</p></div>
                  <div><p className="text-faint text-xs">Criada em</p><p className="text-ink">{formatDate(detalhe.criadaEm)}</p></div>
                  <div><p className="text-faint text-xs">Membros</p><p className="text-ink">{detalhe.membros?.length ?? 0}</p></div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Ações</p>
                  <div className="flex flex-wrap gap-2">
                    <AcaoBtn icon={HandCoins} tone="good" loading={acaoEmCurso === 'pagamento-manual'}
                      onClick={() => executar('pagamento-manual', { diasDeAcesso: 30, motivo: 'Registrado pelo painel admin' })}>
                      Registrar pagamento (+30 dias)
                    </AcaoBtn>
                    <AcaoBtn icon={RefreshCw} loading={acaoEmCurso === 'sincronizar'} onClick={() => executar('sincronizar')}>
                      Sincronizar com o provedor
                    </AcaoBtn>
                    {interna ? (
                      <AcaoBtn icon={Gift} loading={acaoEmCurso === 'desmarcar-interna'} onClick={() => executar('desmarcar-interna')}>
                        Remover cortesia
                      </AcaoBtn>
                    ) : (
                      <AcaoBtn icon={Gift} loading={acaoEmCurso === 'marcar-interna'} onClick={() => executar('marcar-interna')}>
                        Marcar como cortesia
                      </AcaoBtn>
                    )}
                    {bloqueada ? (
                      <AcaoBtn icon={ShieldCheck} tone="good" loading={acaoEmCurso === 'desbloquear'} onClick={() => executar('desbloquear')}>
                        Desbloquear acesso
                      </AcaoBtn>
                    ) : (
                      <AcaoBtn icon={ShieldOff} tone="danger" onClick={() => setPedindoMotivoPara('bloquear')}>
                        Bloquear acesso
                      </AcaoBtn>
                    )}
                    <AcaoBtn icon={Ban} tone="danger" onClick={() => setPedindoMotivoPara('cancelar')}>
                      Cancelar assinatura
                    </AcaoBtn>
                  </div>
                  <p className="text-xs text-faint mt-2">
                    Bloquear/cancelar só impede novo lançamento — a família continua lendo e exportando o histórico.
                  </p>
                </div>

                <div className="pt-3 border-t border-red-100">
                  <p className="text-xs font-medium text-red-700 uppercase tracking-wide mb-2">Zona de risco</p>
                  <AcaoBtn icon={Trash2} tone="danger" onClick={() => setConfirmandoExclusao(true)}>
                    Apagar agora (sem esperar 7 dias)
                  </AcaoBtn>
                  <p className="text-xs text-faint mt-2">
                    Pula o prazo de arrependimento da LGPD. Uso do operador para limpar
                    conta de teste — não use numa família de cliente de verdade. Se a
                    instância do WhatsApp não estava conectada no momento, o número pode
                    não conseguir parear de novo até você remover o aparelho antigo em
                    "Aparelhos conectados" no celular dele.
                  </p>
                </div>

                {detalhe.billingEvents?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Histórico de cobrança</p>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {detalhe.billingEvents.map((e) => (
                        <div key={e.id} className="text-xs text-muted flex justify-between">
                          <span>{e.tipo}</span>
                          <span className="text-faint">{e.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detalhe.auditoria?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Auditoria do painel</p>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {detalhe.auditoria.map((a) => (
                        <div key={a.id} className="text-xs text-muted flex justify-between gap-2">
                          <span>{a.acao} — {a.adminEmail}</span>
                          <span className="text-faint whitespace-nowrap">{formatDate(a.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {pedindoMotivoPara && (
        <PedirMotivo
          titulo={pedindoMotivoPara === 'bloquear' ? 'Bloquear acesso' : 'Cancelar assinatura'}
          loading={acaoEmCurso === pedindoMotivoPara}
          onCancelar={() => setPedindoMotivoPara(null)}
          onConfirmar={(motivo) => executar(pedindoMotivoPara, { motivo })}
        />
      )}

      {confirmandoExclusao && (
        <ConfirmarExclusao
          nomeFamilia={detalhe?.nome || ''}
          loading={acaoEmCurso === 'apagar-agora'}
          onCancelar={() => setConfirmandoExclusao(false)}
          onConfirmar={apagarAgora}
        />
      )}
    </div>
  );
}

export default function ClientesTab() {
  const [familias, setFamilias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [familiaAberta, setFamiliaAberta] = useState(null);
  const [busca, setBusca] = useState('');
  const [segmento, setSegmento] = useState('todas');

  async function carregar() {
    setCarregando(true);
    try {
      const { data } = await api.get('/plataforma/familias');
      setFamilias(data.familias || []);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return familias
      .filter((f) => pertenceAoSegmentoCliente(f, segmento))
      .filter((f) => !termo
        || f.donoNome?.toLowerCase().includes(termo)
        || f.nome?.toLowerCase().includes(termo)
        || f.donoTelefone?.includes(termo)
        || f.donoEmail?.toLowerCase().includes(termo));
  }, [familias, busca, segmento]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="input pl-9"
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <button type="button" onClick={carregar} className="btn-secondary text-sm flex items-center gap-2 self-start sm:self-auto">
          <RotateCcw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SEGMENTOS_CLIENTE.map((s) => (
          <button
            key={s.chave}
            type="button"
            onClick={() => setSegmento(s.chave)}
            className={`px-2.5 py-1 text-xs font-medium rounded-full border ${segmento === s.chave ? 'bg-brand-700 text-white border-brand-700' : 'border-border-strong text-muted hover:bg-surface-alt'}`}
          >
            {s.rotulo}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-ink">
            Famílias ({filtradas.length}{filtradas.length !== familias.length ? ` de ${familias.length}` : ''}) — clique para gerir
          </h2>
        </div>
        <div className="overflow-x-auto">
          {carregando && familias.length === 0 ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-faint" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-xs text-muted uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Cliente</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Vence</th>
                  <th className="text-right px-4 py-2 font-medium">Dias</th>
                  <th className="text-right px-4 py-2 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((f) => (
                  <tr key={f.id} className="table-row cursor-pointer" onClick={() => setFamiliaAberta(f.id)}>
                    <td className="px-4 py-2.5">
                      <p className="text-ink">
                        {f.donoNome || '(sem nome cadastrado)'}
                        {f.donoTelefone && <span className="text-faint font-normal"> · {formatarParaLeitura(f.donoTelefone)}</span>}
                      </p>
                      <p className="text-xs text-faint">
                        {f.nome || 'sem nome de família'} · desde {formatDate(f.criadaEm)}
                        {f.exclusaoAgendadaPara && <span className="text-red-500"> · exclusão em {formatDate(f.exclusaoAgendadaPara)}</span>}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CORES_DO_STATUS[f.status] || 'bg-surface-alt text-muted'}`}>
                        {f.status || 'sem assinatura'}
                      </span>
                      {f.emCarencia && <span className="ml-1 text-xs text-red-600">carência</span>}
                      {!f.podeLancar && <span className="ml-1 text-xs text-red-600">bloqueada</span>}
                      {f.bloqueadaPeloOperador && <span className="ml-1 text-xs text-red-600">operador</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{f.expiraEm ? formatDate(f.expiraEm) : '-'}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{f.diasRestantes ?? '-'}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{f.precoCentavos != null ? formatCurrency(f.precoCentavos / 100) : '-'}</td>
                  </tr>
                ))}
                {filtradas.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-faint">Nenhuma família neste filtro.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {familiaAberta && (
        <DetalheFamilia familiaId={familiaAberta} onClose={() => setFamiliaAberta(null)} onMudou={carregar} />
      )}
    </div>
  );
}
