import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { User, Lock, MessageSquare, Users, Loader2, Eye, EyeOff, CheckCircle2, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useHousehold } from '../hooks/useHousehold';
import MeusDados from '../components/lgpd/MeusDados';
import ConectarWhatsapp from '../components/whatsapp/ConectarWhatsapp';
import ParticipantesDaFamilia from '../components/whatsapp/ParticipantesDaFamilia';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import toast from 'react-hot-toast';

function Section({ icon: Icon, title, children, id }) {
  return (
    <div id={id} className="card space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <div className="w-8 h-8 bg-brand-light rounded-lg flex items-center justify-center">
          <Icon className="w-4 h-4 text-brand-dark" />
        </div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
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
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [nomeFamilia, setNomeFamilia] = useState('');

  // Controlada por query param (?tab=familia) para o tour guiado poder abrir
  // direto na aba certa ao navegar pra cá, sem simular clique em elemento do Radix.
  const [searchParams, setSearchParams] = useSearchParams();
  const abaAtual = ['conta', 'familia', 'dados'].includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'conta';

  const profileForm = useForm({ defaultValues: { name: user?.name || '', email: user?.email || '' } });
  const passwordForm = useForm();
  const whatsappForm = useForm();

  useEffect(() => {
    api.get('/whatsapp/config').then(({ data }) => {
      // Só o campo que este formulário edita. Carregar instância, credencial e
      // grupo aqui fazia o "Salvar" mandá-los de volta vazios e apagar a
      // configuração do canal — foi assim que uma conta perdeu o grupo.
      whatsappForm.reset({
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
      setTrocandoSenha(false);
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
    <div className="max-w-2xl mx-auto">
      <Tabs
        value={abaAtual}
        onValueChange={(v) => setSearchParams(v === 'conta' ? {} : { tab: v })}
      >
        <TabsList>
          <TabsTrigger value="conta">Conta</TabsTrigger>
          <TabsTrigger value="familia">Família e WhatsApp</TabsTrigger>
          <TabsTrigger value="dados">Dados e privacidade</TabsTrigger>
        </TabsList>

        {/* ── Conta: perfil + senha ── */}
        <TabsContent value="conta" className="space-y-6">
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

          {/* Senha — fechada por padrão.
              Trocar senha é ação rara; três campos permanentemente abertos empurram
              para baixo o que a pessoa realmente veio fazer. */}
          <Section icon={Lock} title="Senha">
            {!trocandoSenha ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted">
                  Sua senha de acesso ao painel.
                </p>
                <button
                  type="button"
                  onClick={() => setTrocandoSenha(true)}
                  className="btn-secondary text-sm flex-shrink-0"
                >
                  Trocar senha
                </button>
              </div>
            ) : (
            <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-3">
              <div>
                <label className="label">Senha Atual</label>
                <div className="relative">
                  <input
                    type={showCurrentPwd ? 'text' : 'password'}
                    className="input pr-10"
                    {...passwordForm.register('currentPassword', { required: true })}
                  />
                  <button type="button" onClick={() => setShowCurrentPwd(!showCurrentPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint">
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
                  <button type="button" onClick={() => setShowNewPwd(!showNewPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint">
                    {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Confirmar Nova Senha</label>
                <input type="password" className="input" {...passwordForm.register('confirmPassword', { required: true })} />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={savingPassword} className="btn-primary flex items-center gap-2">
                  {savingPassword ? <><Loader2 className="w-4 h-4 animate-spin" /> Alterando...</> : <><CheckCircle2 className="w-4 h-4" /> Alterar senha</>}
                </button>
                <button
                  type="button"
                  onClick={() => { setTrocandoSenha(false); passwordForm.reset(); }}
                  className="btn-secondary text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
            )}
          </Section>
        </TabsContent>

        {/* ── Família e WhatsApp: membros, conexão, ajustes do canal ── */}
        <TabsContent value="familia" className="space-y-6">
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
              <p className="text-xs text-faint mb-2">
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

              <p className="text-xs text-faint mt-2">
                Para lançar no nome de outra pessoa, cite o nome no fim:{' '}
                <code className="bg-surface-alt px-1 rounded">gastei 84,90 no mercado raquel</code>
              </p>
            </div>
          </Section>

          <Section icon={MessageSquare} title="WhatsApp" id="tour-whatsapp-mode">
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
                <p className="text-xs text-faint mt-1">
                  É o texto que o sistema responde no WhatsApp depois de registrar.
                  Onde você escrever <code className="bg-surface-alt px-1 rounded">{'{tipo}'}</code>,{' '}
                  <code className="bg-surface-alt px-1 rounded">{'{valor}'}</code> ou{' '}
                  <code className="bg-surface-alt px-1 rounded">{'{categoria}'}</code>, entram os dados
                  do lançamento. Deixe como está se não quiser mudar.
                </p>
              </div>

              <button type="submit" disabled={savingWhatsapp} className="btn-primary flex items-center gap-2">
                {savingWhatsapp ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><CheckCircle2 className="w-4 h-4" /> Salvar</>}
              </button>
            </form>
          </Section>
        </TabsContent>

        {/* ── Dados e privacidade: LGPD isolado ── */}
        <TabsContent value="dados">
          <Section icon={ShieldCheck} title="Meus dados (LGPD)">
            <MeusDados podeExcluir={!!permissoes.gerirAssinatura} />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
