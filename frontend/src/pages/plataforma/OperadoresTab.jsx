import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, UserPlus, ShieldCheck, KeyRound, Power, X, Check,
  AlertTriangle, Pencil,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

/**
 * Quem trabalha no painel — criar, mudar papel, desativar.
 *
 * Substitui `tools/criar-login-operador.js` no uso do dia a dia: contratar
 * alguém para o suporte não pode exigir terminal e quatro flags (regra 8 do
 * projeto — resolver por tela/CLI, não ensinar comando).
 *
 * A matriz de permissões vem do BACKEND (`/plataforma/operadores/papeis`), e
 * não de uma cópia aqui: duas listas divergiriam, e a que divergisse a favor
 * do usuário viraria brecha. O que esta tela mostra é sempre o que o servidor
 * de fato aplica.
 */

const CORES_PAPEL = {
  ATENDENTE: 'bg-surface-alt text-muted',
  SUPORTE_SENIOR: 'bg-brand-light text-brand-dark',
  FINANCEIRO: 'bg-blue-50 text-blue-700',
  ADMIN: 'bg-emerald-50 text-emerald-700',
};

const NOME_PAPEL = {
  ATENDENTE: 'Atendente',
  SUPORTE_SENIOR: 'Suporte sênior',
  FINANCEIRO: 'Financeiro',
  ADMIN: 'Administrador',
};

function Etiqueta({ papel }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CORES_PAPEL[papel] || CORES_PAPEL.ATENDENTE}`}>
      {NOME_PAPEL[papel] || papel}
    </span>
  );
}

function dataCurta(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('pt-BR');
}

export default function OperadoresTab() {
  const [operadores, setOperadores] = useState([]);
  const [catalogo, setCatalogo] = useState({ papeis: [], capacidades: [] });
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, papeis] = await Promise.all([
        api.get('/plataforma/operadores'),
        api.get('/plataforma/operadores/papeis'),
      ]);
      setOperadores(lista.data);
      setCatalogo(papeis.data);
    } catch {
      toast.error('Não consegui carregar os operadores.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function alternarAtivo(operador) {
    try {
      await api.put(`/plataforma/operadores/${operador.uid}`, { ativo: !operador.ativo });
      toast.success(operador.ativo ? 'Operador desativado.' : 'Operador reativado.');
      await carregar();
    } catch (erro) {
      toast.error(erro.response?.data?.error || 'Não consegui alterar.');
    }
  }

  if (carregando) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-faint" /></div>;
  }

  const ativos = operadores.filter((o) => o.ativo).length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-ink">Equipe</h2>
          <p className="text-sm text-muted mt-0.5">
            {ativos} {ativos === 1 ? 'operador ativo' : 'operadores ativos'}
            {operadores.length > ativos && ` · ${operadores.length - ativos} desativado(s)`}
          </p>
        </div>
        <button type="button" onClick={() => setCriando(true)} className="btn-primary flex items-center gap-2 text-sm">
          <UserPlus className="w-4 h-4" /> Novo operador
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-alt border-b border-border">
              <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-2.5">Operador</th>
              <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-2.5">Papel</th>
              <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-2.5 hidden md:table-cell">E-mail de aviso</th>
              <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-2.5 hidden lg:table-cell">Último acesso</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {operadores.map((o) => (
              <tr key={o.uid} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <p className={`font-medium ${o.ativo ? 'text-ink' : 'text-faint'}`}>{o.nome || o.usuario}</p>
                  <p className="text-xs text-faint font-mono">{o.usuario}</p>
                </td>
                <td className="px-4 py-3">
                  <Etiqueta papel={o.papel} />
                  {!o.ativo && <span className="ml-1.5 text-xs text-expense">desativado</span>}
                  {o.permissoesExtras?.length > 0 && (
                    <span className="ml-1.5 text-xs text-muted">+{o.permissoesExtras.length} extra</span>
                  )}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {o.email
                    ? <span className="text-muted text-xs">{o.email}</span>
                    : (
                      <span className="text-xs text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> sem e-mail
                      </span>
                    )}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted">
                  {dataCurta(o.ultimoAcessoEm) || <span className="text-faint">nunca entrou</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditando(o)}
                      className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-alt transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => alternarAtivo(o)}
                      className={`p-1.5 rounded-lg transition-colors hover:bg-surface-alt
                                  ${o.ativo ? 'text-muted hover:text-expense' : 'text-income hover:text-income'}`}
                      title={o.ativo ? 'Desativar' : 'Reativar'}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* O e-mail real não é enfeite: sem ele o aviso de encaminhamento vai
          para @operador.revelacash.internal, caixa que não existe. */}
      {operadores.some((o) => o.ativo && !o.email) && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-card px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
          Operador sem e-mail real não recebe aviso de chamado encaminhado — o login interno
          (@operador.revelacash.internal) não é uma caixa de verdade.
        </p>
      )}

      <MatrizDePapeis catalogo={catalogo} />

      {criando && (
        <FormularioOperador
          catalogo={catalogo}
          onFechar={() => setCriando(false)}
          onSalvou={async () => { setCriando(false); await carregar(); }}
        />
      )}

      {editando && (
        <FormularioOperador
          operador={editando}
          catalogo={catalogo}
          onFechar={() => setEditando(null)}
          onSalvou={async () => { setEditando(null); await carregar(); }}
        />
      )}
    </div>
  );
}

/** A matriz inteira, para responder "quem pode o quê" sem abrir cada pessoa. */
function MatrizDePapeis({ catalogo }) {
  const [aberta, setAberta] = useState(false);

  if (!catalogo.papeis?.length) return null;

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setAberta(!aberta)}
        className="flex items-center gap-2 text-sm font-semibold text-ink w-full text-left"
      >
        <ShieldCheck className="w-4 h-4 text-brand-dark" />
        O que cada papel pode fazer
        <span className="ml-auto text-xs text-muted font-normal">{aberta ? 'ocultar' : 'ver matriz'}</span>
      </button>

      {aberta && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs border border-border rounded-card overflow-hidden">
            <thead>
              <tr className="bg-surface-alt">
                <th className="text-left font-semibold text-ink px-3 py-2 border-b border-border">Permissão</th>
                {catalogo.papeis.map((p) => (
                  <th key={p.papel} className="px-3 py-2 border-b border-border text-center font-semibold text-ink whitespace-nowrap">
                    {NOME_PAPEL[p.papel] || p.papel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catalogo.capacidades.map((c) => (
                <tr key={c.chave} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-ink">{c.rotulo}</td>
                  {catalogo.papeis.map((p) => (
                    <td key={p.papel} className="px-3 py-2 text-center">
                      {p.capacidades.includes(c.chave)
                        ? <Check className="w-3.5 h-3.5 text-income mx-auto" />
                        : <span className="text-faint">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Criar ou editar. É o MESMO formulário porque os campos são os mesmos — o que
 * muda é a senha (só na criação) e as permissões extras (só na edição, já que
 * elas pressupõem alguém que existe).
 */
function FormularioOperador({ operador, catalogo, onFechar, onSalvou }) {
  const ehNovo = !operador;

  const [nome, setNome] = useState(operador?.nome || '');
  const [usuario, setUsuario] = useState(operador?.usuario || '');
  const [email, setEmail] = useState(operador?.email || '');
  const [papel, setPapel] = useState(operador?.papel || 'ATENDENTE');
  const [senha, setSenha] = useState('');
  const [extras, setExtras] = useState(operador?.permissoesExtras || []);
  const [salvando, setSalvando] = useState(false);

  const doPapel = catalogo.papeis?.find((p) => p.papel === papel)?.capacidades || [];

  async function salvar(evento) {
    evento.preventDefault();
    setSalvando(true);
    try {
      if (ehNovo) {
        await api.post('/plataforma/operadores', {
          usuario: usuario.trim().toLowerCase(),
          nome: nome.trim(),
          email: email.trim() || null,
          papel,
          senha,
        });
        toast.success('Operador criado.');
      } else {
        await api.put(`/plataforma/operadores/${operador.uid}`, {
          nome: nome.trim(),
          email: email.trim() || null,
          papel,
          permissoesExtras: extras,
        });
        toast.success('Operador atualizado.');
      }
      await onSalvou();
    } catch (erro) {
      toast.error(erro.response?.data?.error || 'Não consegui salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function trocarSenha() {
    const nova = window.prompt('Nova senha (mínimo 10 caracteres):');
    if (!nova) return;
    try {
      await api.post(`/plataforma/operadores/${operador.uid}/senha`, { senha: nova });
      toast.success('Senha redefinida.');
    } catch (erro) {
      toast.error(erro.response?.data?.error || 'Não consegui redefinir.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60" onClick={onFechar}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-white">
          <h3 className="font-bold text-ink">{ehNovo ? 'Novo operador' : `Editar ${operador.nome || operador.usuario}`}</h3>
          <button type="button" onClick={onFechar} className="text-muted hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={salvar} className="px-5 py-4 space-y-4">
          <div>
            <label className="label">Nome</label>
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
          </div>

          <div>
            <label className="label">Usuário de login</label>
            <input
              className="input font-mono"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              disabled={!ehNovo}
              placeholder="maria.silva"
              required
            />
            <p className="text-xs text-faint mt-1">
              {ehNovo
                ? 'Letras minúsculas, números, ponto, hífen ou _. Não pode ser mudado depois.'
                : 'O usuário de login não muda.'}
            </p>
          </div>

          <div>
            <label className="label">E-mail real (para receber avisos)</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@empresa.com"
            />
            <p className="text-xs text-faint mt-1">
              É para cá que vai o aviso de chamado encaminhado. Sem isso, o aviso não chega a
              ninguém.
            </p>
          </div>

          <div>
            <label className="label">Papel</label>
            <select className="input" value={papel} onChange={(e) => setPapel(e.target.value)}>
              {catalogo.papeis?.map((p) => (
                <option key={p.papel} value={p.papel}>{NOME_PAPEL[p.papel] || p.papel}</option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1.5">
              {catalogo.papeis?.find((p) => p.papel === papel)?.descricao}
            </p>
          </div>

          {ehNovo && (
            <div>
              <label className="label">Senha inicial</label>
              <input
                type="text"
                className="input font-mono"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                minLength={10}
                required
                placeholder="mínimo 10 caracteres"
              />
              <p className="text-xs text-faint mt-1">
                Combine com a pessoa e peça para ela trocar. Este painel vê dados de todas as
                famílias.
              </p>
            </div>
          )}

          {!ehNovo && (
            <div>
              <label className="label">Permissões extras</label>
              <p className="text-xs text-faint mb-2">
                Acrescentam ao papel, sem promover. O que já vem do papel aparece marcado e
                travado.
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto border border-border rounded-card p-2">
                {catalogo.capacidades?.map((c) => {
                  const doPapelJa = doPapel.includes(c.chave);
                  const marcada = doPapelJa || extras.includes(c.chave);

                  return (
                    <label
                      key={c.chave}
                      className={`flex items-center gap-2 text-sm px-1.5 py-1 rounded
                                  ${doPapelJa ? 'text-faint' : 'text-ink cursor-pointer hover:bg-surface-alt'}`}
                    >
                      <input
                        type="checkbox"
                        checked={marcada}
                        disabled={doPapelJa}
                        onChange={(e) => setExtras(e.target.checked
                          ? [...extras, c.chave]
                          : extras.filter((x) => x !== c.chave))}
                      />
                      {c.rotulo}
                      {doPapelJa && <span className="text-xs ml-auto">do papel</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button type="submit" className="btn-primary flex items-center gap-2" disabled={salvando}>
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {ehNovo ? 'Criar operador' : 'Salvar'}
            </button>

            {!ehNovo && (
              <button type="button" onClick={trocarSenha} className="btn-secondary flex items-center gap-2 text-sm">
                <KeyRound className="w-4 h-4" /> Redefinir senha
              </button>
            )}

            <button type="button" onClick={onFechar} className="text-sm text-muted hover:text-ink ml-auto">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
