import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { User, Lock, MessageSquare, Users, Loader2, Eye, EyeOff, CheckCircle2, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useHousehold } from '../hooks/useHousehold';
import MeusDados from '../components/lgpd/MeusDados';
import ConectarWhatsapp from '../components/whatsapp/ConectarWhatsapp';
import toast from 'react-hot-toast';

function Section({ icon: Icon, title, children }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
        <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary-600" />
        </div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { user, updateUser, changePassword } = useAuth();
  const {
    household, membros, permissoes, buscarHousehold,
    adicionarMembro, atualizarMembro, removerMembro, renomearFamilia,
  } = useHousehold();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [allowPrivateChat, setAllowPrivateChat] = useState(false);
  const [novoMembro, setNovoMembro] = useState({ nome: '', telefone: '' });
  const [salvandoMembro, setSalvandoMembro] = useState(false);
  const [nomeFamilia, setNomeFamilia] = useState('');

  const profileForm = useForm({ defaultValues: { name: user?.name || '', email: user?.email || '' } });
  const passwordForm = useForm();
  const whatsappForm = useForm();

  useEffect(() => {
    api.get('/whatsapp/config').then(({ data }) => {
      whatsappForm.reset({
        evolutionApiUrl: data.evolutionApiUrl || '',
        instanceName: data.instanceName || '',
        apiKey: data.apiKey || '',
        groupId: data.groupId || '',
        confirmationMessageTemplate: data.confirmationMessageTemplate || '',
      });
      setAllowPrivateChat(data.allowPrivateChat || false);
    }).catch(() => {});
    buscarHousehold().then((h) => { if (h) setNomeFamilia(h.name || ''); });
  }, [buscarHousehold]);

  async function handleProfileSubmit(data) {
    setSavingProfile(true);
    try {
      const res = await api.put('/auth/me', data);
      updateUser({ ...user, ...res.data });
      toast.success('Perfil atualizado!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar perfil.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(data) {
    if (data.newPassword !== data.confirmPassword) {
      toast.error('As senhas não coincidem.');
      return;
    }
    if (data.newPassword === data.currentPassword) {
      toast.error('A nova senha precisa ser diferente da atual.');
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(data.currentPassword, data.newPassword);
      toast.success('Senha alterada com sucesso!');
      passwordForm.reset();
    } catch (err) {
      toast.error(err.message || 'Erro ao alterar senha.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleWhatsappSubmit(data) {
    setSavingWhatsapp(true);
    try {
      // `enabled` NÃO vai daqui: quem liga e desliga o canal é o assistente de
      // conexão. Mandar o valor que a tela carregou desligaria a integração de
      // quem conectou o WhatsApp depois de abrir esta página.
      await api.put('/whatsapp/config', { ...data, allowPrivateChat });
      toast.success('Configurações do WhatsApp salvas!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar configurações.');
    } finally {
      setSavingWhatsapp(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Perfil */}
      <Section icon={User} title="Dados do Usuário">
        <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="space-y-3">
          <div>
            <label className="label">Nome</label>
            <input className="input" {...profileForm.register('name', { required: true })} />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input type="email" className="input" {...profileForm.register('email', { required: true })} />
          </div>
          <button type="submit" disabled={savingProfile} className="btn-primary flex items-center gap-2">
            {savingProfile ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><CheckCircle2 className="w-4 h-4" /> Salvar Perfil</>}
          </button>
        </form>
      </Section>

      {/* Senha */}
      <Section icon={Lock} title="Alterar Senha">
        <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-3">
          <div>
            <label className="label">Senha Atual</label>
            <div className="relative">
              <input
                type={showCurrentPwd ? 'text' : 'password'}
                className="input pr-10"
                {...passwordForm.register('currentPassword', { required: true })}
              />
              <button type="button" onClick={() => setShowCurrentPwd(!showCurrentPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showCurrentPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Nova Senha</label>
            <div className="relative">
              <input
                type={showNewPwd ? 'text' : 'password'}
                className="input pr-10"
                placeholder="Mínimo 6 caracteres"
                {...passwordForm.register('newPassword', { required: true, minLength: 6 })}
              />
              <button type="button" onClick={() => setShowNewPwd(!showNewPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Confirmar Nova Senha</label>
            <input type="password" className="input" {...passwordForm.register('confirmPassword', { required: true })} />
          </div>
          <button type="submit" disabled={savingPassword} className="btn-primary flex items-center gap-2">
            {savingPassword ? <><Loader2 className="w-4 h-4 animate-spin" /> Alterando...</> : <><CheckCircle2 className="w-4 h-4" /> Alterar Senha</>}
          </button>
        </form>
      </Section>

      {/* Família */}
      <Section icon={Users} title="Minha Família">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="label">Nome da família</label>
            <input
              className="input"
              value={nomeFamilia}
              onChange={(e) => setNomeFamilia(e.target.value)}
              placeholder="Ex: Família Petri"
              disabled={!permissoes.gerirMembros}
            />
          </div>
          {permissoes.gerirMembros && (
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={!nomeFamilia.trim() || nomeFamilia === household?.name}
              onClick={() => renomearFamilia(nomeFamilia.trim()).catch((e) =>
                toast.error(e.response?.data?.error || 'Erro ao renomear.'))}
            >
              Salvar
            </button>
          )}
        </div>

        <div>
          <label className="label">Membros</label>
          <p className="text-xs text-gray-400 mb-2">
            Quem participa do controle financeiro. O telefone permite identificar
            automaticamente quem pagou, pelo número que enviou a mensagem.
          </p>

          <div className="space-y-2">
            {membros.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-700 text-xs font-bold">
                    {(m.name || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {m.name}
                    {m.role === 'owner' && (
                      <span className="ml-2 text-xs font-normal text-primary-600">dono</span>
                    )}
                    {m.pendenteDeConta && (
                      <span className="ml-2 text-xs font-normal text-gray-400">sem login</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {m.phone || 'sem telefone'}{m.email ? ` · ${m.email}` : ''}
                  </p>
                </div>
                {permissoes.gerirMembros && m.role !== 'owner' && (
                  <button
                    type="button"
                    onClick={() => removerMembro(m.id).catch((e) =>
                      toast.error(e.response?.data?.error || 'Erro ao remover.'))}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                    title="Remover da família"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {permissoes.gerirMembros && (
            <div className="flex gap-2 items-center mt-3">
              <input
                className="input flex-1"
                placeholder="Nome (ex: Raquel)"
                value={novoMembro.nome}
                onChange={(e) => setNovoMembro((n) => ({ ...n, nome: e.target.value }))}
              />
              <input
                className="input flex-1"
                placeholder="WhatsApp (ex: 5564999555364)"
                value={novoMembro.telefone}
                onChange={(e) => setNovoMembro((n) => ({ ...n, telefone: e.target.value.replace(/\D/g, '') }))}
              />
              <button
                type="button"
                disabled={!novoMembro.nome.trim() || salvandoMembro}
                onClick={async () => {
                  setSalvandoMembro(true);
                  try {
                    // Sem conta ainda: entra com ID sintético e já é reconhecido
                    // pelo telefone no WhatsApp. Ao criar login, o convite liga
                    // a conta real a este registro.
                    await adicionarMembro({
                      userId: `pendente-${novoMembro.nome.trim().toLowerCase().replace(/[^a-z0-9]/g, '')}`,
                      nome: novoMembro.nome.trim(),
                      telefone: novoMembro.telefone || null,
                      papel: 'member',
                    });
                    setNovoMembro({ nome: '', telefone: '' });
                  } catch (e) {
                    toast.error(e.response?.data?.error || 'Erro ao adicionar membro.');
                  } finally {
                    setSalvandoMembro(false);
                  }
                }}
                className="btn-secondary text-sm flex-shrink-0"
              >
                {salvandoMembro ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
              </button>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-2">
            Também dá para indicar no fim da mensagem:{' '}
            <code className="bg-gray-100 px-1 rounded">gasto mercado 84,90 pix raquel</code>
          </p>
        </div>
      </Section>

      {/* WhatsApp — conexão em três passos */}
      <Section icon={MessageSquare} title="WhatsApp">
        <ConectarWhatsapp podeGerir={!!permissoes.gerirCanal} />
      </Section>

      {/* Ajustes do canal */}
      <Section icon={MessageSquare} title="Ajustes do WhatsApp">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
          <div>
            <p className="text-sm font-medium text-gray-900">Aceitar mensagens privadas</p>
            <p className="text-xs text-gray-500">
              Processar lançamentos enviados diretamente para o número do bot.
              Outros conteúdos (fotos, links, vídeos) são ignorados automaticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAllowPrivateChat(!allowPrivateChat)}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ml-4 ${allowPrivateChat ? 'bg-primary-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${allowPrivateChat ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <form onSubmit={whatsappForm.handleSubmit(handleWhatsappSubmit)} className="space-y-3">
          <div>
            <label className="label">Mensagem de Confirmação</label>
            <input className="input" placeholder="✅ Lançamento registrado: {tipo} de R$ {valor}" {...whatsappForm.register('confirmationMessageTemplate')} />
            <p className="text-xs text-gray-400 mt-1">Use: {'{tipo}'} {'{valor}'} {'{categoria}'}</p>
          </div>

          <button type="submit" disabled={savingWhatsapp} className="btn-primary flex items-center gap-2">
            {savingWhatsapp ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><CheckCircle2 className="w-4 h-4" /> Salvar Configurações</>}
          </button>
        </form>
      </Section>

      {/* LGPD */}
      <Section icon={ShieldCheck} title="Meus dados (LGPD)">
        <MeusDados podeExcluir={!!permissoes.gerirAssinatura} />
      </Section>
    </div>
  );
}
