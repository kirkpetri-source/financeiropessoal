import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { User, Lock, MessageSquare, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
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
  const { user, updateUser } = useAuth();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);

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
      setWhatsappEnabled(data.enabled || false);
    }).catch(() => {});
  }, []);

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
    setSavingPassword(true);
    try {
      await api.put('/auth/me/password', { currentPassword: data.currentPassword, newPassword: data.newPassword });
      toast.success('Senha alterada com sucesso!');
      passwordForm.reset();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar senha.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleWhatsappSubmit(data) {
    setSavingWhatsapp(true);
    try {
      await api.put('/whatsapp/config', { ...data, enabled: whatsappEnabled });
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

      {/* WhatsApp / Evolution API */}
      <Section icon={MessageSquare} title="Integração WhatsApp (Evolution API)">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
          <div>
            <p className="text-sm font-medium text-gray-900">Integração ativa</p>
            <p className="text-xs text-gray-500">Receber lançamentos via WhatsApp</p>
          </div>
          <button
            type="button"
            onClick={() => setWhatsappEnabled(!whatsappEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${whatsappEnabled ? 'bg-primary-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${whatsappEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <form onSubmit={whatsappForm.handleSubmit(handleWhatsappSubmit)} className="space-y-3">
          <div>
            <label className="label">URL da Evolution API</label>
            <input type="url" className="input" placeholder="https://api.evolution.io" {...whatsappForm.register('evolutionApiUrl')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nome da Instância</label>
              <input className="input" placeholder="minha-instancia" {...whatsappForm.register('instanceName')} />
            </div>
            <div>
              <label className="label">API Key / Token</label>
              <input className="input" placeholder="••••••••" {...whatsappForm.register('apiKey')} />
            </div>
          </div>
          <div>
            <label className="label">ID do Grupo Financeiro</label>
            <input className="input" placeholder="120363000000000@g.us" {...whatsappForm.register('groupId')} />
            <p className="text-xs text-gray-400 mt-1">ID do grupo do WhatsApp onde os lançamentos serão enviados.</p>
          </div>
          <div>
            <label className="label">Mensagem de Confirmação</label>
            <input className="input" placeholder="✅ Lançamento registrado: {tipo} de R$ {valor}" {...whatsappForm.register('confirmationMessageTemplate')} />
            <p className="text-xs text-gray-400 mt-1">Use: {'{tipo}'} {'{valor}'} {'{categoria}'}</p>
          </div>

          <div className="pt-1">
            <p className="text-xs font-medium text-gray-500 mb-2">URL do Webhook para configurar na Evolution API:</p>
            <div className="bg-gray-50 rounded-lg px-3 py-2 font-mono text-xs text-gray-700 break-all select-all">
              {window.location.protocol}//{window.location.hostname}:3001/api/webhooks/evolution
            </div>
          </div>

          <button type="submit" disabled={savingWhatsapp} className="btn-primary flex items-center gap-2">
            {savingWhatsapp ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><CheckCircle2 className="w-4 h-4" /> Salvar Configurações</>}
          </button>
        </form>
      </Section>
    </div>
  );
}
