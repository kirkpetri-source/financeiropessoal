import { useState } from 'react';
import { Loader2, Trash2, Pencil, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { mascararTelefone, erroDoTelefone, paraApi, formatarParaLeitura } from '../../utils/telefone';

/**
 * Cadastro de quem vai lançar gastos.
 *
 * Vem ANTES da leitura do QR no modo grupo: o WhatsApp não cria grupo vazio, e
 * o sistema monta o grupo sozinho assim que o celular conecta. Sem os
 * participantes já cadastrados, a criação falharia com um erro que o cliente
 * não teria como resolver.
 *
 * Permite editar o telefone de quem já está na lista — inclusive o do dono,
 * que se cadastra sem telefone e antes não tinha como corrigir.
 */
export default function ParticipantesDaFamilia({
  membros, maxMembros = 8, onAdicionar, onAtualizar, onRemover,
}) {
  const [novo, setNovo] = useState({ nome: '', telefone: '' });
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [rascunho, setRascunho] = useState({ nome: '', telefone: '' });

  const cheio = membros.length >= maxMembros;

  const erroNovo = novo.telefone ? erroDoTelefone(novo.telefone) : null;

  async function adicionar() {
    if (!novo.nome.trim()) return toast.error('Informe o nome.');

    const erro = erroDoTelefone(novo.telefone);
    if (erro) return toast.error(erro);

    const e164 = paraApi(novo.telefone);

    setSalvando(true);
    try {
      await onAdicionar({
        userId: `wa-${e164}`,
        nome: novo.nome.trim(),
        telefone: e164,
        papel: 'member',
      });
      setNovo({ nome: '', telefone: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao adicionar.');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarEdicao(id) {
    // Telefone é opcional na edição — mas se veio algo, tem que estar certo.
    const erro = erroDoTelefone(rascunho.telefone, { obrigatorio: false });
    if (erro) return toast.error(erro);

    try {
      await onAtualizar(id, {
        nome: rascunho.nome.trim(),
        telefone: paraApi(rascunho.telefone) || null,
      });
      setEditando(null);
      toast.success('Atualizado.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar.');
    }
  }

  return (
    <div className="space-y-2">
      {membros.map((m) => (
        <div key={m.id} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
          {editando === m.id ? (
            <>
              <input
                className="input flex-1 text-sm"
                value={rascunho.nome}
                onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value }))}
                placeholder="Nome"
              />
              <input
                className="input flex-1 text-sm"
                value={rascunho.telefone}
                onChange={(e) => setRascunho((r) => ({ ...r, telefone: mascararTelefone(e.target.value) }))}
                placeholder="(64) 99955-5364"
                inputMode="numeric"
              />
              <button type="button" onClick={() => salvarEdicao(m.id)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg">
                <Check className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setEditando(null)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <span className="text-primary-700 text-xs font-bold">
                  {(m.name || '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {m.name}
                  {m.role === 'owner' && <span className="ml-2 text-xs font-normal text-primary-600">você</span>}
                </p>
                <p className={`text-xs truncate ${m.phone ? 'text-gray-400' : 'text-amber-600'}`}>
                  {m.phone ? formatarParaLeitura(m.phone) : 'sem telefone — os gastos não serão identificados'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setEditando(m.id); setRascunho({ nome: m.name || '', telefone: m.phone || '' }); }}
                className="p-2 text-gray-400 hover:text-primary-600 hover:bg-white rounded-lg"
                title="Editar"
              >
                <Pencil className="w-4 h-4" />
              </button>
              {m.role !== 'owner' && (
                <button
                  type="button"
                  onClick={() => onRemover(m.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-white rounded-lg"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      ))}

      {cheio ? (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Limite de {maxMembros} pessoas por família atingido.
        </p>
      ) : (
        <div className="pt-1">
          <div className="flex gap-2 items-center">
            <input
              className="input flex-1"
              placeholder="Nome (ex: Raquel)"
              value={novo.nome}
              onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))}
            />
            <input
              className={`input flex-1 ${erroNovo ? 'border-red-400 focus:ring-red-400' : ''}`}
              placeholder="(64) 99955-5364"
              value={novo.telefone}
              onChange={(e) => setNovo((n) => ({ ...n, telefone: mascararTelefone(e.target.value) }))}
              inputMode="numeric"
            />
            <button
              type="button"
              onClick={adicionar}
              disabled={salvando || !!erroNovo || !novo.nome.trim()}
              className="btn-secondary text-sm flex-shrink-0"
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
            </button>
          </div>
          {erroNovo && <p className="text-xs text-red-500 mt-1">{erroNovo}</p>}
        </div>
      )}
    </div>
  );
}
