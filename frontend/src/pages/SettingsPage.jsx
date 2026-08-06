import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { User, Lock, MessageSquare, Users, Loader2, Eye, EyeOff, CheckCircle2, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useHousehold } from '../hooks/useHousehold';
import MeusDados from '../components/lgpd/MeusDados';
import ConectarWhatsapp from '../components/whatsapp/ConectarWhatsapp';
import ParticipantesDaFamilia from '../components/whatsapp/ParticipantesDaFamilia';
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
      // Só o que este formulário edita. `enabled` e `allowPrivateChat` são
      // decididos pelo assistente de conexão e pelo modo de uso; mandá-los
      // daqui sobrescreveria com o valor que a tela carregou lá atrás.
      await api.put('/whatsapp/config', data);
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

          {/* Mesmo componente do assistente do WhatsApp: uma lista só, com
              edição de telefone. Antes o telefone era só de leitura, e o dono
              — que se cadastra sem telefone — ficava sem como corrigir. */}
          <ParticipantesDaFamilia
            membros={membros}
            onAdicionar={adicionarMembro}
            onAtualizar={atualizarMembro}
            onRemover={(id) => removerMembro(id).catch((e) =>
              toast.error(e.response?.data?.error || 'Erro ao remover.'))}
          />

          <p className="text-xs text-gray-400 mt-2">
            Também dá para indicar no fim da mensagem:{' '}
            <code className="bg-gray-100 px-1 rounded">gasto mercado 84,90 pix raquel</code>
          </p>
        </div>
      </Section>

      {/* WhatsApp — escolha do modo e conexão */}
      <Section icon={MessageSquare} title="WhatsApp">
        <ConectarWhatsapp
          podeGerir={!!permissoes.gerirCanal}
          membros={membros}
          acoesDeMembro={{
            adicionar: adicionarMembro,
            atualizar: atualizarMembro,
            remover: removerMembro,
            recarregar: buscarHousehold,
          }}
        />
      </Section>

      {/* Ajustes do canal
          O botão "Aceitar mensagens privadas" saiu daqui de propósito. Quem
          decide isso é o modo de uso (individual liga, grupo desliga), e o
          botão carregava o valor uma vez no início: depois de escolher o modo,
          salvar a mensagem de confirmação mandava o valor velho junto e
          desligava o canal do próprio cliente, sem nenhum aviso. */}
      <Section icon={MessageSquare} title="Ajustes do WhatsApp">
        <form onSubmit={whatsappForm.handleSubmit(handleWhatsappSubmit)} className="space-y-3">
          <div>
            <label className="label">Mensagem de confirmação</label>
            <input
              className="input"
              placeholder="✅ Lançamento registrado: {tipo} de R$ {valor} em {categoria}"
              {...whatsappForm.register('confirmationMessageTemplate')}
            />
            <p className="text-xs text-gray-400 mt-1">
              É o texto que o sistema responde no WhatsApp depois de registrar.
              Onde você escrever <code className="bg-gray-100 px-1 rounded">{'{tipo}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{valor}'}</code> ou{' '}
              <code className="bg-gray-100 px-1 rounded">{'{categoria}'}</code>, entram os dados
              do lançamento. Deixe como está se não quiser mudar.
            </p>
          </div>

          <button type="submit" disabled={savingWhatsapp} className="btn-primary flex items-center gap-2">
            {savingWhatsapp ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><CheckCircle2 className="w-4 h-4" /> Salvar</>}
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
