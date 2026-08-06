import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Smartphone, Users, CheckCircle2, Loader2, QrCode, Copy, RefreshCw, LogOut, Link2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

/**
 * Assistente de conexão do WhatsApp — três passos, zero jargão.
 *
 * O que existia antes: um formulário pedindo URL do servidor Evolution, nome da
 * instância e API key. Isso só era respondível por quem administra a VPS. Um
 * cliente que comprou um controle financeiro não tem como responder nada disso,
 * e nem deveria — a credencial é do operador, não dele.
 *
 * Agora: ele lê um QR Code, toca em "criar grupo" e compartilha um link.
 */

const PASSOS = [
  { id: 1, titulo: 'Conectar seu WhatsApp', icone: Smartphone },
  { id: 2, titulo: 'Criar o grupo da família', icone: Users },
  { id: 3, titulo: 'Chamar quem vai participar', icone: Link2 },
];

// O QR da Evolution expira em ~40s. Buscamos o estado a cada 3s enquanto ele
// está na tela, para o passo virar sozinho assim que o cliente ler.
const INTERVALO_DE_CONSULTA = 3000;

function Passo({ numero, titulo, Icone, estado, children }) {
  const cores = {
    feito: 'bg-green-100 text-green-700 border-green-200',
    ativo: 'bg-primary-50 text-primary-700 border-primary-200',
    espera: 'bg-gray-50 text-gray-400 border-gray-200',
  };

  return (
    <div className={`rounded-2xl border p-4 ${estado === 'espera' ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${cores[estado]}`}>
          {estado === 'feito' ? <CheckCircle2 className="w-4 h-4" /> : <Icone className="w-4 h-4" />}
        </div>
        <div>
          <p className="text-xs text-gray-400">Passo {numero}</p>
          <p className="text-sm font-semibold text-gray-900">{titulo}</p>
        </div>
      </div>
      {estado === 'ativo' && children && <div className="mt-4 pl-12">{children}</div>}
    </div>
  );
}

export default function ConectarWhatsapp({ podeGerir }) {
  const [status, setStatus] = useState(null);
  const [qrcode, setQrcode] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [criandoGrupo, setCriandoGrupo] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const consultaRef = useRef(null);

  const buscarStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/whatsapp/status');
      setStatus(data);
      // Conectou: o QR não serve para mais nada e some da tela.
      if (data.conectada) setQrcode(null);
      return data;
    } catch (err) {
      if (err.response?.status !== 503) toast.error('Não foi possível verificar a conexão.');
      return null;
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { buscarStatus(); }, [buscarStatus]);

  // Só consulta em laço enquanto há QR na tela esperando leitura.
  useEffect(() => {
    if (!qrcode) {
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
  }, [qrcode, buscarStatus]);

  async function conectar() {
    setConectando(true);
    try {
      const { data } = await api.post('/whatsapp/conectar');
      if (data.conectada) {
        toast.success('WhatsApp já está conectado.');
        buscarStatus();
      } else {
        setQrcode(data.qrcode);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível gerar o QR Code.');
    } finally {
      setConectando(false);
    }
  }

  async function criarGrupo() {
    setCriandoGrupo(true);
    try {
      const { data } = await api.post('/whatsapp/grupo');
      toast.success(data.jaExistia ? 'O grupo já existia.' : 'Grupo criado!');
      buscarStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível criar o grupo.');
    } finally {
      setCriandoGrupo(false);
    }
  }

  async function sincronizarMembros() {
    setSincronizando(true);
    try {
      const { data } = await api.post('/whatsapp/membros/sincronizar');
      if (data.novos > 0) toast.success(`${data.novos} pessoa(s) cadastrada(s).`);
      else toast('Ninguém novo no grupo.');

      if (data.excedentes > 0) {
        toast.error(`${data.excedentes} pessoa(s) ficaram de fora: o limite é ${data.limite} por família.`);
      }
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

  function copiar(texto) {
    navigator.clipboard.writeText(texto);
    toast.success('Link copiado!');
  }

  if (carregando) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;
  }

  if (!podeGerir) {
    return (
      <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-3 py-2.5">
        Só quem é dono da família configura o WhatsApp.
      </p>
    );
  }

  const etapa = status?.etapa || 'sem_instancia';
  const conectada = !!status?.conectada;
  const temGrupo = !!status?.temGrupo;

  const estadoDoPasso = (numero) => {
    if (numero === 1) return conectada ? 'feito' : 'ativo';
    if (numero === 2) return temGrupo ? 'feito' : conectada ? 'ativo' : 'espera';
    return temGrupo ? 'ativo' : 'espera';
  };

  return (
    <div className="space-y-3">
      {etapa === 'pronto' && (
        <div className="flex items-center gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Tudo pronto. Mande no grupo: <code className="bg-white px-1.5 py-0.5 rounded">mercado 84,90 pix</code>
        </div>
      )}

      <Passo numero={1} titulo={PASSOS[0].titulo} Icone={Smartphone} estado={estadoDoPasso(1)}>
        {!qrcode ? (
          <>
            <p className="text-sm text-gray-600 mb-3">
              Você vai ler um código com o WhatsApp do celular. É o mesmo processo
              do WhatsApp Web.
            </p>
            <button
              type="button"
              onClick={conectar}
              disabled={conectando}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {conectando
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando código...</>
                : <><QrCode className="w-4 h-4" /> Gerar código</>}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <div className="bg-white border border-gray-200 rounded-xl p-3 inline-block">
              <img src={qrcode} alt="QR Code para conectar o WhatsApp" className="w-56 h-56" />
            </div>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              <li>Abra o WhatsApp no celular</li>
              <li>Toque nos três pontinhos e em <strong>Dispositivos conectados</strong></li>
              <li>Toque em <strong>Conectar dispositivo</strong> e aponte para o código</li>
            </ol>
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
              <span className="text-xs text-gray-400">Esperando a leitura...</span>
              <button type="button" onClick={conectar} className="text-xs text-primary-600 underline ml-2">
                Gerar outro código
              </button>
            </div>
          </div>
        )}
      </Passo>

      <Passo numero={2} titulo={PASSOS[1].titulo} Icone={Users} estado={estadoDoPasso(2)}>
        <p className="text-sm text-gray-600 mb-3">
          Criamos um grupo no seu WhatsApp. É nele que a família vai mandar os gastos.
        </p>
        <button
          type="button"
          onClick={criarGrupo}
          disabled={criandoGrupo}
          className="btn-primary text-sm flex items-center gap-2"
        >
          {criandoGrupo
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</>
            : <><Users className="w-4 h-4" /> Criar grupo da família</>}
        </button>
      </Passo>

      <Passo numero={3} titulo={PASSOS[2].titulo} Icone={Link2} estado={estadoDoPasso(3)}>
        <p className="text-sm text-gray-600 mb-3">
          Mande este link para quem vai lançar gastos. Até {status?.maxMembros || 8} pessoas
          na mesma família — quem entrar aparece aqui depois de você atualizar.
        </p>

        {status?.linkConvite && (
          <div className="flex gap-2 mb-3">
            <input readOnly value={status.linkConvite} className="input flex-1 text-xs" />
            <button
              type="button"
              onClick={() => copiar(status.linkConvite)}
              className="btn-secondary text-sm flex items-center gap-1.5 flex-shrink-0"
            >
              <Copy className="w-4 h-4" /> Copiar
            </button>
          </div>
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

      {conectada && (
        <button
          type="button"
          onClick={desconectar}
          className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1.5 pt-2"
        >
          <LogOut className="w-3.5 h-3.5" /> Desconectar o WhatsApp
        </button>
      )}
    </div>
  );
}
