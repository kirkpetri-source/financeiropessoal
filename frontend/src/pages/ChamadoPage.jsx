import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Headset, User, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useChamados, LIMITE_CARACTERES } from '../hooks/useChamados';
import { Situacao, AnexosDaMensagem, EscolherAnexos } from '../components/suporte/PecasDoChamado';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatDate } from '../utils/formatters';

/**
 * A conversa de um chamado.
 *
 * Abrir a tela já marca como lido — não existe botão de "marcar como lido" para
 * a pessoa lembrar de clicar.
 */
export default function ChamadoPage() {
  const { numero } = useParams();
  const { buscar, responder, baixarAnexo } = useChamados();

  const [chamado, setChamado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;

    (async () => {
      setCarregando(true);
      try {
        const dados = await buscar(numero);
        if (ativo) setChamado(dados);
      } catch (e) {
        if (ativo) setErro(e.response?.status === 404 ? 'Chamado não encontrado.' : 'Não consegui carregar este chamado.');
      } finally {
        if (ativo) setCarregando(false);
      }
    })();

    return () => { ativo = false; };
  }, [numero, buscar]);

  async function recarregar() {
    setChamado(await buscar(numero));
  }

  if (carregando) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;

  if (erro) {
    return (
      <div className="card text-center py-12">
        <p className="text-ink font-medium">{erro}</p>
        <Link to="/suporte" className="btn-secondary mt-4 inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Voltar para os chamados
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/suporte" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Chamados
      </Link>

      <div className="card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <span className="font-mono text-xs text-muted">#{chamado.numero}</span>
            <h1 className="text-lg font-bold text-ink">{chamado.assunto}</h1>
            <p className="mt-0.5 text-xs text-muted">
              Aberto em {formatDate(chamado.criadoEm)}
              {chamado.reaberturaDe && (
                <> · continuação do <Link to={`/suporte/${chamado.reaberturaDe}`} className="underline">#{chamado.reaberturaDe}</Link></>
              )}
            </p>
          </div>
          <Situacao status={chamado.status} />
        </div>
      </div>

      <Conversa mensagens={chamado.mensagens} numero={chamado.numero} onBaixar={baixarAnexo} />

      {chamado.status === 'RESOLVIDO' && <AvisoDeResolvido chamado={chamado} />}

      <Responder numero={numero} responder={responder} onRespondeu={recarregar} />
    </div>
  );
}

function AvisoDeResolvido({ chamado }) {
  const porInatividade = chamado.motivoResolucao === 'INATIVIDADE_CLIENTE';

  return (
    <div className="border border-border rounded-xl p-3 flex items-start gap-2.5 text-sm">
      <CheckCircle2 className="w-4 h-4 text-income flex-shrink-0 mt-0.5" />
      <p className="text-muted">
        {porInatividade
          ? 'Este chamado foi encerrado porque ficou sem resposta por 15 dias.'
          : 'Este chamado foi marcado como resolvido.'}
        {' '}Se ainda precisar de ajuda, é só responder abaixo que ele reabre.
      </p>
    </div>
  );
}

function Conversa({ mensagens, numero, onBaixar }) {
  async function baixar(anexo) {
    try {
      await onBaixar(numero, anexo);
    } catch {
      toast.error('Não consegui baixar este anexo.');
    }
  }

  return (
    <div className="space-y-3">
      {(mensagens || []).map((mensagem) => {
        const doSuporte = mensagem.autor === 'SUPORTE';

        return (
          <div key={mensagem.id} className={`flex gap-2.5 ${doSuporte ? '' : 'flex-row-reverse'}`}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                          ${doSuporte ? 'bg-brand-light' : 'bg-surface-alt'}`}
            >
              {doSuporte
                ? <Headset className="w-4 h-4 text-brand-dark" />
                : <User className="w-4 h-4 text-muted" />}
            </div>

            <div className={`min-w-0 max-w-[85%] ${doSuporte ? '' : 'text-right'}`}>
              <div
                className={`inline-block text-left rounded-xl px-3 py-2 border
                            ${doSuporte ? 'bg-white border-border' : 'bg-surface-alt border-border'}`}
              >
                <p className="text-xs text-muted mb-1">
                  {doSuporte ? (mensagem.autorNome || 'Suporte') : 'Você'} · {formatDate(mensagem.em)}
                </p>
                <p className="text-sm text-ink whitespace-pre-wrap break-words">{mensagem.texto}</p>
                <AnexosDaMensagem anexos={mensagem.anexos} onBaixar={baixar} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Responder({ numero, responder, onRespondeu }) {
  const [texto, setTexto] = useState('');
  const [arquivos, setArquivos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const campo = useRef(null);

  async function enviar(evento) {
    evento.preventDefault();
    if (!texto.trim() || enviando) return;

    setEnviando(true);
    try {
      await responder(numero, { texto, arquivos });
      setTexto('');
      setArquivos([]);
      await onRespondeu();
    } catch (erro) {
      toast.error(erro.response?.data?.error || 'Não consegui enviar sua resposta.');
    } finally {
      setEnviando(false);
      // Devolve o foco depois do envio: quem acabou de escrever costuma ter
      // mais a dizer, e caçar o campo com o mouse a cada mensagem cansa.
      campo.current?.focus();
    }
  }

  return (
    <form onSubmit={enviar} className="card space-y-3">
      <textarea
        ref={campo}
        className="input min-h-[88px] resize-y"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={LIMITE_CARACTERES}
        placeholder="Escreva sua resposta"
        // Sem `disabled={enviando}` de propósito: desabilitar campo de texto
        // durante o envio faz o navegador tirar o foco, e ele não volta
        // sozinho. O envio já está barrado pela guarda acima.
      />

      <EscolherAnexos arquivos={arquivos} onMudar={setArquivos} />

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={!texto.trim() || enviando}>
          {enviando ? 'Enviando...' : 'Enviar'}
        </button>
      </div>
    </form>
  );
}
