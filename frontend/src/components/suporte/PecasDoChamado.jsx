import { useEffect, useState } from 'react';
import { Paperclip, X, FileText, Image as Icone, Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { STATUS, LIMITE_ANEXOS, problemaNoArquivo } from '../../hooks/useChamados';

/** Etiqueta de status. Mesmos tons do resto do painel. */
export function Situacao({ status }) {
  const tons = {
    aberto: 'bg-brand-light text-brand-dark',
    atencao: 'bg-amber-50 text-amber-700',
    ok: 'bg-emerald-50 text-emerald-700',
  };
  const info = STATUS[status] || { rotulo: status, tom: 'aberto' };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tons[info.tom]}`}>
      {info.rotulo}
    </span>
  );
}

/**
 * Tamanho do arquivo.
 *
 * O caso de menos de 1 KB existe porque `Math.round(bytes / 1024)` mostrava
 * "0 KB" num print pequeno — e um anexo que anuncia zero parece anexo que não
 * subiu.
 */
function tamanhoLegivel(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Anexos de uma mensagem, clicáveis para VER.
 *
 * Abriam forçando download, e quem só queria conferir um print acabava com
 * arquivo na pasta de downloads a cada clique (apontado pelo Kirk em
 * 22/08/2026). Agora imagem abre num visualizador aqui mesmo e PDF vai para
 * uma aba nova, que é onde o navegador já sabe exibi-lo. Quem quiser guardar
 * usa o botão de baixar do visualizador — ou o menu do botão direito, que
 * funciona porque a imagem é uma <img> de verdade.
 *
 * O backend continua mandando `Content-Disposition: attachment` e `nosniff`,
 * e isso NÃO muda: o arquivo chega como blob e é a tela que decide exibi-lo.
 * Trocar o cabeçalho para `inline` faria a URL da API abrir conteúdo enviado
 * por cliente direto no navegador, que é justamente o que aquele cabeçalho
 * existe para impedir.
 *
 * `carregar(anexo)` devolve um Blob — quem chama é que sabe se a rota é a do
 * cliente ou a do operador.
 */
export function AnexosDaMensagem({ anexos, carregar }) {
  const [abrindo, setAbrindo] = useState(null);
  const [vendo, setVendo] = useState(null);

  // Todo objectURL criado precisa ser liberado, senão o blob fica na memória
  // da aba até ela ser fechada — numa conversa com vários anexos isso soma.
  useEffect(() => () => { if (vendo?.url) URL.revokeObjectURL(vendo.url); }, [vendo]);

  if (!anexos?.length) return null;

  async function abrir(anexo) {
    setAbrindo(anexo.id);
    try {
      const blob = await carregar(anexo);
      const url = URL.createObjectURL(blob);

      if (anexo.mimeType === 'application/pdf') {
        // PDF o navegador já exibe sozinho, e num visualizador melhor que
        // qualquer um que eu montasse aqui.
        window.open(url, '_blank', 'noopener');
        // Sem revoke imediato: a aba nova ainda está lendo a URL.
        return;
      }

      setVendo({ anexo, url });
    } catch {
      toast.error('Não consegui abrir este anexo.');
    } finally {
      setAbrindo(null);
    }
  }

  function fechar() {
    if (vendo?.url) URL.revokeObjectURL(vendo.url);
    setVendo(null);
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {anexos.map((anexo) => {
          const Simbolo = anexo.mimeType === 'application/pdf' ? FileText : Icone;
          const carregando = abrindo === anexo.id;

          return (
            <button
              key={anexo.id}
              type="button"
              onClick={() => abrir(anexo)}
              disabled={carregando}
              title={anexo.mimeType === 'application/pdf' ? 'Abrir em nova aba' : 'Visualizar'}
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg
                         border border-border bg-white hover:bg-surface-alt transition-colors"
            >
              {carregando
                ? <Loader2 className="w-3.5 h-3.5 text-muted flex-shrink-0 animate-spin" />
                : <Simbolo className="w-3.5 h-3.5 text-muted flex-shrink-0" />}
              <span className="text-ink max-w-[180px] truncate">{anexo.nomeOriginal}</span>
              <span className="text-faint">{tamanhoLegivel(anexo.tamanho)}</span>
            </button>
          );
        })}
      </div>

      {vendo && <Visualizador anexo={vendo.anexo} url={vendo.url} onFechar={fechar} />}
    </>
  );
}

/** Imagem em tamanho grande, sobre o resto da tela. */
function Visualizador({ anexo, url, onFechar }) {
  // Esc fecha: é o reflexo de quem abriu uma imagem em qualquer lugar.
  useEffect(() => {
    const aoTeclar = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink/80 p-4"
      onClick={onFechar}
      role="dialog"
      aria-label={anexo.nomeOriginal}
    >
      <div
        className="flex items-center gap-3 text-white text-sm mb-3 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate flex-1">{anexo.nomeOriginal}</span>
        <span className="text-white/60 text-xs">{tamanhoLegivel(anexo.tamanho)}</span>

        <a
          href={url}
          download={anexo.nomeOriginal || 'anexo'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                     bg-white/10 hover:bg-white/20 transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Baixar
        </a>

        <button
          type="button"
          onClick={onFechar}
          className="p-1 rounded-lg hover:bg-white/20 transition-colors"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* `img` de verdade, e não background: é o que faz o botão direito
          oferecer "Salvar imagem como" e "Copiar imagem". */}
      <img
        src={url}
        alt={anexo.nomeOriginal}
        onClick={(e) => e.stopPropagation()}
        className="flex-1 min-h-0 object-contain rounded-lg"
      />

      <p className="text-center text-white/50 text-xs mt-3 flex-shrink-0">
        Clique fora ou aperte Esc para fechar
      </p>
    </div>
  );
}

/**
 * Escolha de arquivos, antes de enviar.
 *
 * Mostra o problema de cada arquivo na hora em que ele é escolhido, e não
 * depois do upload: descobrir que o PDF passa de 5 MB só quando a mensagem
 * falha é o tipo de fricção que faz a pessoa desistir de mandar o print.
 */
export function EscolherAnexos({ arquivos, onMudar }) {
  const cheio = arquivos.length >= LIMITE_ANEXOS;

  function acrescentar(evento) {
    const escolhidos = Array.from(evento.target.files || []);
    evento.target.value = '';

    const cabem = escolhidos.slice(0, LIMITE_ANEXOS - arquivos.length);
    if (cabem.length) onMudar([...arquivos, ...cabem]);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border
                      border-border transition-colors cursor-pointer
                      ${cheio ? 'text-faint' : 'text-ink bg-white hover:bg-surface-alt'}`}
        >
          <Paperclip className="w-4 h-4" />
          Anexar
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,application/pdf"
            className="hidden"
            disabled={cheio}
            onChange={acrescentar}
          />
        </label>

        <span className="text-xs text-muted">
          PNG, JPG ou PDF · até 5 MB cada · máximo {LIMITE_ANEXOS}
        </span>
      </div>

      {arquivos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {arquivos.map((arquivo, i) => {
            const problema = problemaNoArquivo(arquivo);

            return (
              <li
                key={`${arquivo.name}-${i}`}
                className="flex items-center gap-2 text-xs border border-border rounded-lg px-2 py-1.5"
              >
                <Paperclip className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                <span className="text-ink truncate flex-1">{arquivo.name}</span>

                {problema
                  ? <span className="text-expense flex-shrink-0">{problema}</span>
                  : <span className="text-faint flex-shrink-0">{tamanhoLegivel(arquivo.size)}</span>}

                <button
                  type="button"
                  onClick={() => onMudar(arquivos.filter((_, j) => j !== i))}
                  className="text-muted hover:text-ink transition-colors flex-shrink-0"
                  aria-label={`Remover ${arquivo.name}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export { tamanhoLegivel };
