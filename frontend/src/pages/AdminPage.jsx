import { useState, useEffect } from 'react';
import { Loader2, Lock, RefreshCw, X, ShieldOff, ShieldCheck, Gift, RotateCcw, Ban, HandCoins } from 'lucide-react';
import api from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { formatarParaLeitura } from '../utils/telefone';
import toast from 'react-hot-toast';

/**
 * Painel de operação do SaaS — MRR, churn, a fila de famílias que precisam de
 * atenção, e (a partir daqui) as ações administrativas sobre cada uma:
 * pagamento manual, cortesia, cancelar, bloquear. É a única tela do sistema
 * que olha e mexe em várias famílias ao mesmo tempo, por isso vive atrás de
 * um 403 do backend (não de um `if` aqui) numa URL não-óbvia — esconder o
 * botão não é controle de acesso.
 */

function Numero({ rotulo, valor, detalhe, destaque }) {
  return (
    <div className={`card ${destaque ? 'ring-1 ring-brand-200' : ''}`}>
      <p className="text-xs font-medium text-muted uppercase tracking-wide">{rotulo}</p>
      <p className={`mt-1 font-bold ${destaque ? 'text-2xl text-brand-700' : 'text-xl text-ink'}`}>
        {valor}
      </p>
      {detalhe && <p className="text-xs text-faint mt-0.5">{detalhe}</p>}
    </div>
  );
}

const CORES_DO_STATUS = {
  active: 'bg-green-100 text-green-800',
  trialing: 'bg-blue-100 text-blue-800',
  past_due: 'bg-red-100 text-red-800',
  pending: 'bg-amber-100 text-amber-800',
  canceled: 'bg-surface-alt text-muted',
  paused: 'bg-surface-alt text-muted',
};

function percentual(fracao) {
  return `${((fracao || 0) * 100).toFixed(1)}%`;
}

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

/** Motivo curto obrigatório para ações sensíveis (bloquear, cancelar). */
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

function DetalheFamilia({ familiaId, onClose, onMudou }) {
  const [detalhe, setDetalhe] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [acaoEmCurso, setAcaoEmCurso] = useState(null);
  const [pedindoMotivoPara, setPedindoMotivoPara] = useState(null);

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

  useEffect(() => { carregar(); }, [familiaId]);

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
      </div>

      {pedindoMotivoPara && (
        <PedirMotivo
          titulo={pedindoMotivoPara === 'bloquear' ? 'Bloquear acesso' : 'Cancelar assinatura'}
          loading={acaoEmCurso === pedindoMotivoPara}
          onCancelar={() => setPedindoMotivoPara(null)}
          onConfirmar={(motivo) => executar(pedindoMotivoPara, { motivo })}
        />
      )}
    </div>
  );
}

export default function AdminPage() {
  const [metricas, setMetricas] = useState(null);
  const [familias, setFamilias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [semAcesso, setSemAcesso] = useState(false);
  const [familiaAberta, setFamiliaAberta] = useState(null);

  async function carregar() {
    setCarregando(true);
    try {
      const [m, f] = await Promise.all([
        api.get('/plataforma/metricas'),
        api.get('/plataforma/familias'),
      ]);
      setMetricas(m.data);
      setFamilias(f.data.familias || []);
      setSemAcesso(false);
    } catch (err) {
      if (err.response?.status === 403) setSemAcesso(true);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  if (carregando && !metricas) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-faint" />
      </div>
    );
  }

  if (semAcesso) {
    return (
      <div className="card max-w-md mx-auto text-center space-y-2">
        <Lock className="w-6 h-6 text-faint mx-auto" />
        <p className="text-sm font-medium text-ink">Acesso restrito</p>
        <p className="text-xs text-muted">
          Este painel é da operação do serviço. Configure ADMIN_EMAILS no backend
          para liberar o seu e-mail.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Operação</h1>
          <p className="text-sm text-muted">Janela de {metricas?.janelaDias} dias</p>
        </div>
        <button type="button" onClick={carregar} className="btn-secondary text-sm flex items-center gap-2">
          <RotateCcw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero
          rotulo="MRR"
          valor={formatCurrency(metricas?.mrr)}
          detalhe={`ARR ${formatCurrency(metricas?.arr)}`}
          destaque
        />
        <Numero
          rotulo="Pagantes"
          valor={metricas?.pagantes ?? 0}
          detalhe={`ticket ${formatCurrency((metricas?.ticketMedioCentavos || 0) / 100)}`}
        />
        <Numero
          rotulo="Churn"
          valor={percentual(metricas?.churnMensal)}
          detalhe={`${metricas?.canceladasNaJanela ?? 0} cancelamento(s)`}
        />
        <Numero
          rotulo="Conversão de trial"
          valor={percentual(metricas?.conversaoDeTrial)}
          detalhe={`${metricas?.ativadasNaJanela ?? 0} ativação(ões) na janela`}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero rotulo="Famílias" valor={metricas?.total ?? 0} detalhe={`${metricas?.novasNaJanela ?? 0} nova(s)`} />
        <Numero rotulo="Ativas hoje" valor={metricas?.ativas ?? 0} detalhe={`${metricas?.emTrial ?? 0} em teste`} />
        <Numero
          rotulo="Precisam de contato"
          valor={(metricas?.atrasadas ?? 0) + (metricas?.emCarencia ?? 0) + (metricas?.trialVencido ?? 0)}
          detalhe={`${metricas?.emCarencia ?? 0} em carência · ${metricas?.trialVencido ?? 0} trial vencido`}
        />
        <Numero
          rotulo="Exclusões pendentes"
          valor={metricas?.aguardandoExclusao ?? 0}
          detalhe={`${metricas?.canceladas ?? 0} cancelada(s)`}
        />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-ink">
            Famílias ({familias.length}) — clique para gerir
          </h2>
        </div>
        <div className="overflow-x-auto">
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
              {familias.map((f) => (
                <tr key={f.id} className="table-row cursor-pointer" onClick={() => setFamiliaAberta(f.id)}>
                  <td className="px-4 py-2.5">
                    <p className="text-ink">
                      {f.donoNome || '(sem nome cadastrado)'}
                      {f.donoTelefone && (
                        <span className="text-faint font-normal"> · {formatarParaLeitura(f.donoTelefone)}</span>
                      )}
                    </p>
                    <p className="text-xs text-faint">
                      {f.nome || 'sem nome de família'} · desde {formatDate(f.criadaEm)}
                      {f.exclusaoAgendadaPara && (
                        <span className="text-red-500"> · exclusão em {formatDate(f.exclusaoAgendadaPara)}</span>
                      )}
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
                  <td className="px-4 py-2.5 text-right text-muted">
                    {f.precoCentavos != null ? formatCurrency(f.precoCentavos / 100) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {familiaAberta && (
        <DetalheFamilia familiaId={familiaAberta} onClose={() => setFamiliaAberta(null)} onMudou={carregar} />
      )}
    </div>
  );
}
