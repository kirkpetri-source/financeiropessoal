import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { mascararTelefone, erroDoTelefone, paraApi } from '../utils/telefone';
import Logo from '../components/brand/Logo';
import toast from 'react-hot-toast';

/**
 * Entrada do sistema: login, cadastro e recuperação de senha.
 *
 * O cadastro é a porta de venda do produto — sem ele, uma família que descobre
 * o serviço não tem como virar cliente. Fica aqui, na mesma tela do login, e
 * não atrás de um convite.
 */

// O Firebase devolve códigos técnicos. Traduzir importa: "auth/email-already-in-use"
// não diz nada para quem está tentando criar uma conta.
const MENSAGENS = {
  'auth/email-already-in-use': 'Esse e-mail já tem conta. Faça login ou recupere a senha.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/weak-password': 'Senha fraca. Use no mínimo 6 caracteres.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'auth/network-request-failed': 'Sem conexão. Verifique sua internet.',
  'auth/operation-not-allowed': 'Cadastro por e-mail não está habilitado no servidor.',
};

function traduzir(err, padrao) {
  return MENSAGENS[err?.code] || err?.response?.data?.error || err?.message || padrao;
}

export default function LoginPage() {
  const { login, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [aba, setAba] = useState('entrar'); // entrar | criar | recuperar
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [aceitouTermos, setAceitouTermos] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset, getValues } = useForm();

  function trocarAba(nova) {
    setAba(nova);
    reset();
    setAceitouTermos(false);
  }

  async function entrar(dados) {
    setCarregando(true);
    try {
      await login(dados.email, dados.password);
      navigate('/dashboard');
    } catch (err) {
      toast.error(traduzir(err, 'Erro ao fazer login.'));
    } finally {
      setCarregando(false);
    }
  }

  async function criarConta(dados) {
    if (!aceitouTermos) {
      toast.error('É preciso aceitar os termos para criar a conta.');
      return;
    }
    setCarregando(true);
    try {
      await signUp({
        nome: dados.nome.trim(),
        email: dados.email.trim(),
        senha: dados.password,
        telefone: paraApi(dados.telefone),
        aceitouTermos: true,
      });
      toast.success('Conta criada! Você tem 7 dias grátis.');
      navigate('/dashboard');
    } catch (err) {
      toast.error(traduzir(err, 'Erro ao criar conta.'));
    } finally {
      setCarregando(false);
    }
  }

  async function recuperar(dados) {
    setCarregando(true);
    try {
      await resetPassword(dados.email.trim());
      // Mensagem igual exista ou não a conta: dizer "e-mail não cadastrado"
      // entregaria a lista de clientes para quem quisesse sondar endereços.
      toast.success('Se houver conta com esse e-mail, o link de redefinição foi enviado.');
      trocarAba('entrar');
    } catch (err) {
      if (err?.code === 'auth/invalid-email') toast.error('E-mail inválido.');
      else toast.success('Se houver conta com esse e-mail, o link de redefinição foi enviado.');
    } finally {
      setCarregando(false);
    }
  }

  const ehCadastro = aba === 'criar';
  const ehRecuperacao = aba === 'recuperar';

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg flex items-center justify-center p-4">
      {/* Cortina de revelação — expressa o conceito de marca (revelar o
          que estava oculto) como animação de entrada, só CSS. */}
      <div
        className="pointer-events-none absolute inset-0 z-10 bg-ink animate-curtain motion-reduce:hidden"
        aria-hidden="true"
      />

      <div className="w-full max-w-md animate-revealcontent motion-reduce:animate-none motion-reduce:opacity-100">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size="lg" withWordmark={false} />
          </div>
          <h1 className="text-2xl font-bold text-ink">
            <span className="text-ink">Revela</span><span className="text-brand">Cash</span>
          </h1>
          <p className="text-muted mt-1">O financeiro da família, revelado no WhatsApp</p>
        </div>

        <div className="bg-white rounded-card shadow-modal border border-border p-6 sm:p-8">
          {ehRecuperacao ? (
            <>
              <button
                type="button"
                onClick={() => trocarAba('entrar')}
                className="text-sm text-muted hover:text-ink flex items-center gap-1 mb-4"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
              <h2 className="text-xl font-semibold text-ink mb-1">Recuperar senha</h2>
              <p className="text-sm text-muted mb-6">
                Enviamos um link para você criar uma senha nova.
              </p>

              <form onSubmit={handleSubmit(recuperar)} className="space-y-4">
                <div>
                  <label className="label">E-mail</label>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    className={`input ${errors.email ? 'border-expense focus:ring-expense' : ''}`}
                    {...register('email', {
                      required: 'E-mail obrigatório.',
                      pattern: { value: /^\S+@\S+\.\S+$/, message: 'E-mail inválido.' },
                    })}
                  />
                  {errors.email && <p className="text-xs text-expense mt-1">{errors.email.message}</p>}
                </div>

                <button type="submit" disabled={carregando} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
                  {carregando ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : 'Enviar link'}
                </button>
              </form>
            </>
          ) : (
            <>
              {/* Abas */}
              <div className="flex gap-1 p-1 bg-surface-alt rounded-xl mb-6">
                {[
                  { id: 'entrar', rotulo: 'Entrar' },
                  { id: 'criar', rotulo: 'Criar conta' },
                ].map(({ id, rotulo }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => trocarAba(id)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                      aba === id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>

              {ehCadastro && (
                <div className="mb-5 px-3 py-2.5 bg-brand-light border border-brand-200 rounded-xl">
                  <p className="text-sm text-brand-dark font-medium">7 dias grátis</p>
                  <p className="text-xs text-brand-dark/80 mt-0.5">
                    Sem cartão. Depois são R$ 24,90 por mês, por família — não por pessoa.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit(ehCadastro ? criarConta : entrar)} className="space-y-4">
                {ehCadastro && (
                  <div>
                    <label className="label">Seu nome</label>
                    <input
                      placeholder="Como devemos te chamar"
                      className={`input ${errors.nome ? 'border-expense focus:ring-expense' : ''}`}
                      {...register('nome', {
                        required: 'Nome obrigatório.',
                        minLength: { value: 2, message: 'Nome muito curto.' },
                      })}
                    />
                    {errors.nome && <p className="text-xs text-expense mt-1">{errors.nome.message}</p>}
                  </div>
                )}

                <div>
                  <label className="label">E-mail</label>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    className={`input ${errors.email ? 'border-expense focus:ring-expense' : ''}`}
                    {...register('email', {
                      required: 'E-mail obrigatório.',
                      pattern: { value: /^\S+@\S+\.\S+$/, message: 'E-mail inválido.' },
                    })}
                  />
                  {errors.email && <p className="text-xs text-expense mt-1">{errors.email.message}</p>}
                </div>

                {ehCadastro && (
                  <div>
                    <label className="label">Seu WhatsApp</label>
                    <input
                      placeholder="(64) 99955-5364"
                      inputMode="numeric"
                      className={`input ${errors.telefone ? 'border-expense focus:ring-expense' : ''}`}
                      {...register('telefone', {
                        required: 'WhatsApp obrigatório.',
                        // A máscara já impede a maior parte do erro; a validação
                        // pega DDD inexistente e fixo, que a máscara não vê.
                        validate: (v) => erroDoTelefone(v) || true,
                        onChange: (e) => { e.target.value = mascararTelefone(e.target.value); },
                      })}
                    />
                    {errors.telefone
                      ? <p className="text-xs text-expense mt-1">{errors.telefone.message}</p>
                      : (
                        <p className="text-xs text-faint mt-1">
                          É por ele que o sistema sabe que o gasto é seu.
                        </p>
                      )}
                  </div>
                )}

                <div>
                  <label className="label">Senha</label>
                  <div className="relative">
                    <input
                      type={mostrarSenha ? 'text' : 'password'}
                      placeholder={ehCadastro ? 'Mínimo 6 caracteres' : 'Sua senha'}
                      className={`input pr-10 ${errors.password ? 'border-expense focus:ring-expense' : ''}`}
                      {...register('password', {
                        required: 'Senha obrigatória.',
                        ...(ehCadastro && { minLength: { value: 6, message: 'Mínimo 6 caracteres.' } }),
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted"
                    >
                      {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-expense mt-1">{errors.password.message}</p>}
                </div>

                {ehCadastro && (
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aceitouTermos}
                      onChange={(e) => setAceitouTermos(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-border-strong text-brand focus:ring-brand"
                    />
                    <span className="text-xs text-muted leading-relaxed">
                      Li e aceito os{' '}
                      <Link to="/termos" target="_blank" className="underline text-brand-dark">termos de uso</Link>
                      {' '}e a{' '}
                      <Link to="/privacidade" target="_blank" className="underline text-brand-dark">política de privacidade</Link>.
                    </span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={carregando || (ehCadastro && !aceitouTermos)}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
                >
                  {carregando ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {ehCadastro ? 'Criando...' : 'Entrando...'}</>
                  ) : (
                    ehCadastro ? 'Criar conta grátis' : 'Entrar'
                  )}
                </button>
              </form>

              {!ehCadastro && (
                <button
                  type="button"
                  onClick={() => {
                    const email = getValues('email');
                    trocarAba('recuperar');
                    if (email) setTimeout(() => reset({ email }), 0);
                  }}
                  className="w-full text-center text-sm text-muted hover:text-ink mt-4"
                >
                  Esqueci minha senha
                </button>
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs text-faint mt-6">
          RevelaCash © {new Date().getFullYear()}
          <br />
          <Link to="/termos" className="underline hover:text-muted">Termos de uso</Link>
          {' · '}
          <Link to="/privacidade" className="underline hover:text-muted">Política de privacidade</Link>
        </p>
      </div>
    </div>
  );
}
