import { Paperclip, X, FileText, Image as Icone } from 'lucide-react';
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

/** Anexos já gravados numa mensagem, clicáveis para baixar. */
export function AnexosDaMensagem({ anexos, onBaixar }) {
  if (!anexos?.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {anexos.map((anexo) => {
        const Simbolo = anexo.mimeType === 'application/pdf' ? FileText : Icone;

        return (
          <button
            key={anexo.id}
            type="button"
            onClick={() => onBaixar(anexo)}
            className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg
                       border border-border bg-white hover:bg-surface-alt transition-colors"
          >
            <Simbolo className="w-3.5 h-3.5 text-muted flex-shrink-0" />
            <span className="text-ink max-w-[180px] truncate">{anexo.nomeOriginal}</span>
            <span className="text-faint">{tamanhoLegivel(anexo.tamanho)}</span>
          </button>
        );
      })}
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
