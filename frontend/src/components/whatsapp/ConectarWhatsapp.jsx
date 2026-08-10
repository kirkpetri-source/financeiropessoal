import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Smartphone, Users, User, CheckCircle2, Loader2, QrCode, Copy, RefreshCw, LogOut, Link2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import ParticipantesDaFamilia from './ParticipantesDaFamilia';

/**
 * Assistente de conexão do WhatsApp — zero jargão.
 *
 * O que existia antes: um formulário pedindo URL do servidor Evolution, nome da
 * instância e API key. Isso só era respondível por quem administra a VPS.
 *
 * Agora a primeira pergunta é de PRODUTO, não de infraestrutura: você vai
 * lançar sozinho ou em família? A resposta muda o resto do caminho —
 *
 *   individual  →  conecta e pronto; lança na conversa consigo mesmo
 *   grupo       →  cadastra quem participa, conecta, e o grupo nasce sozinho
 *
 * A ordem importa: o WhatsApp não cria grupo vazio. Cadastrar depois de
 * conectar deixaria o cliente parado num erro sem saída.
 */

const INTERVALO_DE_CONSULTA = 3000;

function Cartao({ ativo, Icone, titulo, descricao, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-4 rounded-2xl border-2 transition-colors w-full ${
        ativo ? 'border-brand-500 bg-brand-50' : 'border-border-strong hover:border-border-strong'
      }`}
    >
      <Icone className={`w-5 h-5 mb-2 ${ativo ? 'text-brand-600' : 'text-faint'}`} />
      <p className="text-sm font-semibold text-ink">{titulo}</p>
      <p className="text-xs text-muted mt-0.5 leading-relaxed">{descricao}</p>
    </button>
  );
}

function Passo({ numero, titulo, Icone, estado, children }) {
  const cores = {
    feito: 'bg-green-100 text-green-700 border-green-200',
    ativo: 'bg-brand-50 text-brand-700 border-brand-200',
    espera: 'bg-surface-alt text-faint border-border-strong',
  };

  return (
    <div className={`rounded-2xl border p-4 ${estado === 'espera' ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${cores[estado]}`}>
          {estado === 'feito' ? <CheckCircle2 className="w-4 h-4" /> : <Icone className="w-4 h-4" />}
        </div>
        <div>
          <p className="text-xs text-faint">Passo {numero}</p>
          <p className="text-sm font-semibold text-ink">{titulo}</p>
        </div>
      </div>
      {estado === 'ativo' && children && <div className="mt-4 pl-12">{children}</div>}
    </div>
  );
}

/**
 * Celular não lê QR Code exibido na própria tela — é preciso um segundo
 * aparelho, ou abrir o painel no computador.
 *
 * O código de pareamento de 8 letras resolve isso. Chegou a ser removido por
 * dar "código inválido" no WhatsApp (issues 2033/2215/1471 da Evolution), mas
 * a causa era a sessão já ter emitido QR antes de pedir o código — corrigida
 * criando a instância direto sem QR (`instanciaService.conectar`). É por
 * isso que quem está no celular começa neste método.
 */
function pareceCelular() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)')?.matches
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

export default function ConectarWhatsapp({ podeGerir, membros = [], acoesDeMembro }) {
  const [status, setStatus] = useState(null);
  const [qrcode, setQrcode] = useState(null);
  const [pairingCode, setPairingCode] = useState(null);
  const noCelular = pareceCelular();
  // Quem está no celular não tem como ler o QR da própria tela; começa no código.
  const [metodo, setMetodo] = useState(() => (pareceCelular() ? 'codigo' : 'qr'));
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const consultaRef = useRef(null);

  const buscarStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/whatsapp/status');
      setStatus(data);
      if (data.conectada) { setQrcode(null); setPairingCode(null); }
      return data;
    } catch (err) {
      if (err.response?.status !== 503) toast.error('Não foi possível verificar a conexão.');
      return null;
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { buscarStatus(); }, [buscarStatus]);

  useEffect(() => {
    if (!qrcode && !pairingCode) {
      clearInterval(consultaRef.current);
      return undefined;
    }
    consultaRef.current = setInterval(async () => {
      const s = await buscarStatus();
      if (s?.conectada) {
        toast.success('WhatsApp conectado!');
        clearInterval(consultaRef.current);
      }
    }, INTERVALO_DE_CONSULTA);

    return () => clearInterval(consultaRef.current);
  }, [qrcode, pairingCode, buscarStatus]);

  async function escolherModo(modo) {
    try {
      await api.post('/whatsapp/modo', { modo });
      buscarStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível salvar a escolha.');
    }
  }

  async function conectar(metodoEscolhido = metodo) {
    setConectando(true);
    setQrcode(null);
    setPairingCode(null);
    try {
      const { data } = await api.post('/whatsapp/conectar', { metodo: metodoEscolhido });
      if (data.conectada) {
        toast.success('WhatsApp já está conectado.');
        buscarStatus();
      } else if (metodoEscolhido === 'codigo') {
        if (!data.pairingCode) throw new Error('O servidor não devolveu o código. Tente pelo QR Code.');
        setPairingCode(data.pairingCode);
      } else {
        setQrcode(data.qrcode);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Não foi possível gerar o código.');
    } finally {
      setConectando(false);
    }
  }

  function trocarMetodo(novo) {
    setMetodo(novo);
    setQrcode(null);
    setPairingCode(null);
  }

  async function sincronizarMembros() {
    setSincronizando(true);
    try {
      const { data } = await api.post('/whatsapp/membros/sincronizar');
      if (data.novos > 0) toast.success(`${data.novos} pessoa(s) cadastrada(s).`);
      else toast('Ninguém novo no grupo.');

      if (data.excedentes > 0) {
        toast.error(`${data.excedentes} ficaram de fora: o limite é ${data.limite} por família.`);
      }
      acoesDeMembro?.recarregar?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível atualizar os participantes.');
    } finally {
      setSincronizando(false);
    }
  }

  async function desconectar() {
    if (!window.confirm('Desconectar o WhatsApp? Os lançamentos já feitos continuam salvos.')) return;
    try {
      await api.post('/whatsapp/desconectar', {});
      toast.success('WhatsApp desconectado.');
      setQrcode(null);
      buscarStatus();
    } catch {
      toast.error('Não foi possível desconectar.');
    }
  }

  if (carregando) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-faint" /></div>;
  }

  if (!podeGerir) {
    return (
      <p className="text-sm text-muted bg-surface-alt rounded-xl px-3 py-2.5">
        Só quem é dono da família configura o WhatsApp.
      </p>
    );
  }

  const modo = status?.modo || null;
  const conectada = !!status?.conectada;
  const emGrupo = modo === 'grupo';
  const pronto = status?.etapa === 'pronto';

  const comTelefone = membros.filter((m) => m.phone);
  const podeConectar = !emGrupo || comTelefone.some((m) => m.role !== 'owner');

  /* -------- Passo 0: escolha do modo -------- */
  if (!modo) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Como você vai usar? Isso muda o resto da configuração.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Cartao
            Icone={User}
            titulo="Só eu vou lançar"
            descricao="Você manda os gastos numa conversa com você mesmo no WhatsApp. Ninguém mais participa."
            onClick={() => escolherModo('individual')}
          />
          <Cartao
            Icone={Users}
            titulo="Minha família vai lançar junto"
            descricao="Criamos um grupo no seu WhatsApp. Cada pessoa manda os gastos dela e tudo aparece separado por pessoa."
            onClick={() => escolherModo('grupo')}
          />
        </div>
      </div>
    );
  }

  const estadoDoPasso = (numero) => {
    if (!emGrupo) return numero === 1 ? (conectada ? 'feito' : 'ativo') : 'espera';
    if (numero === 1) return podeConectar ? 'feito' : 'ativo';
    if (numero === 2) return conectada ? 'feito' : podeConectar ? 'ativo' : 'espera';
    return conectada ? 'ativo' : 'espera';
  };

  return (
    <div className="space-y-3">
      {pronto && (
        <div className="flex items-start gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Tudo pronto.</p>
            <p className="text-xs mt-1">
              {emGrupo
                ? 'No grupo, comece dizendo se gastou ou recebeu:'
                : 'Na conversa com você mesmo no WhatsApp, comece dizendo se gastou ou recebeu:'}
            </p>
            <p className="text-xs mt-1 space-x-1">
              <code className="bg-white px-1.5 py-0.5 rounded">gastei 84,90 no mercado</code>
              <code className="bg-white px-1.5 py-0.5 rounded">recebi 2500 de salário</code>
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-faint px-1">
        <span>Modo: <strong className="text-muted">{emGrupo ? 'em família' : 'individual'}</strong></span>
        {!conectada && (
          <button type="button" onClick={() => escolherModo(emGrupo ? 'individual' : 'grupo')} className="underline">
            trocar
          </button>
        )}
      </div>

      {emGrupo && (
        <Passo numero={1} titulo="Quem vai participar" Icone={Users} estado={estadoDoPasso(1)}>
          <p className="text-sm text-muted mb-3">
            Cadastre quem vai lançar gastos, com o WhatsApp de cada um. O grupo é
            criado com essas pessoas assim que você conectar.
          </p>
          <ParticipantesDaFamilia
            membros={membros}
            maxMembros={status?.maxMembros || 8}
            onAdicionar={acoesDeMembro?.adicionar}
            onAtualizar={acoesDeMembro?.atualizar}
            onRemover={acoesDeMembro?.remover}
          />
          {!podeConectar && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
              Adicione pelo menos uma pessoa além de você — o WhatsApp não cria grupo de um.
            </p>
          )}
        </Passo>
      )}

      <Passo
        numero={emGrupo ? 2 : 1}
        titulo="Conectar seu WhatsApp"
        Icone={Smartphone}
        estado={estadoDoPasso(emGrupo ? 2 : 1)}
      >
        {/* O método é escolhido ANTES de gerar. O Baileys não aceita pareamento
            numa sessão que já emitiu QR, então trocar aqui recria a instância. */}
        {!qrcode && !pairingCode && (
          <div className="flex gap-1 p-1 bg-surface-alt rounded-xl mb-3">
            {[
              { id: 'codigo', rotulo: 'Estou neste celular' },
              { id: 'qr', rotulo: 'Tenho outro aparelho' },
            ].map(({ id, rotulo }) => (
              <button
                key={id}
                type="button"
                onClick={() => trocarMetodo(id)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  metodo === id ? 'bg-white text-ink shadow-sm' : 'text-muted'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        )}

        {!qrcode && !pairingCode ? (
          <>
            <p className="text-sm text-muted mb-3">
              {metodo === 'codigo'
                ? 'Você vai digitar um código de 8 letras dentro do WhatsApp deste mesmo celular. Não precisa de outro aparelho.'
                : 'Você vai ler um QR Code com a câmera do WhatsApp, de outro aparelho. É o mesmo processo do WhatsApp Web.'}
              {emGrupo && ' Assim que conectar, o grupo é criado sozinho.'}
            </p>

            <button
              type="button"
              onClick={() => conectar()}
              disabled={conectando || !podeConectar}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {conectando
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
                : <><QrCode className="w-4 h-4" /> {metodo === 'codigo' ? 'Gerar código' : 'Gerar QR Code'}</>}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            {pairingCode ? (
              <>
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Este código expira rápido. Já deixe o WhatsApp aberto na tela de
                  "Conectar com número de telefone" antes de olhar o código abaixo.
                </p>
                <p className="text-sm text-muted">Digite este código no WhatsApp:</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-mono text-2xl tracking-[0.25em] font-bold text-ink bg-surface-alt border border-border-strong rounded-xl px-4 py-3 select-all">
                    {pairingCode}
                  </div>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(pairingCode); toast.success('Código copiado!'); }}
                    className="btn-secondary text-sm flex items-center gap-1.5"
                  >
                    <Copy className="w-4 h-4" /> Copiar
                  </button>
                </div>
                <ol className="text-sm text-muted space-y-1 list-decimal list-inside">
                  <li>Abra o WhatsApp neste celular</li>
                  <li>Toque nos três pontinhos e em <strong>Dispositivos conectados</strong></li>
                  <li>Toque em <strong>Conectar dispositivo</strong></li>
                  <li>Toque em <strong>Conectar com número de telefone</strong></li>
                  <li>Digite o código acima assim que ele aparecer</li>
                </ol>
                <p className="text-xs text-faint">
                  Deu "código inválido"? Ele expirou. Toque em "Gerar outro" abaixo e
                  digite mais rápido desta vez.
                </p>
              </>
            ) : (
              <>
                <div className="bg-white border border-border-strong rounded-xl p-3 inline-block">
                  <img src={qrcode} alt="QR Code para conectar o WhatsApp" className="w-56 h-56 max-w-full" />
                </div>
                <ol className="text-sm text-muted space-y-1 list-decimal list-inside">
                  <li>Abra o WhatsApp {noCelular && <strong>em outro aparelho</strong>}</li>
                  <li>Toque nos três pontinhos e em <strong>Dispositivos conectados</strong></li>
                  <li>Toque em <strong>Conectar dispositivo</strong> e aponte a câmera para o código</li>
                </ol>
              </>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-faint" />
              <span className="text-xs text-faint">Esperando a confirmação...</span>
              <button type="button" onClick={() => conectar()} className="text-xs text-brand-600 underline">
                Gerar outro
              </button>
              <button
                type="button"
                onClick={() => trocarMetodo(metodo === 'codigo' ? 'qr' : 'codigo')}
                className="text-xs text-muted underline"
              >
                {metodo === 'codigo' ? 'Usar QR Code' : 'Usar código'}
              </button>
            </div>
          </div>
        )}
      </Passo>

      {emGrupo && (
        <Passo numero={3} titulo="Chamar mais gente (opcional)" Icone={Link2} estado={estadoDoPasso(3)}>
          <p className="text-sm text-muted mb-3">
            Mande este link para quem mais vai lançar. Até {status?.maxMembros || 8} pessoas
            por família.
          </p>

          {status?.linkConvite ? (
            <div className="flex gap-2 mb-3">
              <input readOnly value={status.linkConvite} className="input flex-1 text-xs" />
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(status.linkConvite); toast.success('Link copiado!'); }}
                className="btn-secondary text-sm flex items-center gap-1.5 flex-shrink-0"
              >
                <Copy className="w-4 h-4" /> Copiar
              </button>
            </div>
          ) : (
            <p className="text-xs text-faint mb-3">O link aparece assim que o grupo for criado.</p>
          )}

          <button
            type="button"
            onClick={sincronizarMembros}
            disabled={sincronizando}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            {sincronizando
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Atualizando...</>
              : <><RefreshCw className="w-4 h-4" /> Atualizar participantes</>}
          </button>
        </Passo>
      )}

      {conectada && (
        <button
          type="button"
          onClick={desconectar}
          className="text-xs text-faint hover:text-red-600 flex items-center gap-1.5 pt-2"
        >
          <LogOut className="w-3.5 h-3.5" /> Desconectar o WhatsApp
        </button>
      )}
    </div>
  );
}
