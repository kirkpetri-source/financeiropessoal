import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, DatabaseBackup, RefreshCw, AlertTriangle, CheckCircle2,
  Download, RotateCcw, ShieldAlert, X, History, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

/**
 * Backup: fazer, ver o histórico, baixar e restaurar.
 *
 * Arquivo separado do `SistemaTab` porque cresceu além do que cabe junto com
 * os gráficos de custo — são dois assuntos, e misturá-los faria a tela de
 * custo carregar a lógica da ação mais perigosa do sistema.
 *
 * A primeira versão mostrava só o backup feito NA SESSÃO ATUAL, guardado em
 * estado do React: recarregar a página apagava a única pista de que o backup
 * existia, e a tela parecia não ter funcionado (foi o que o Kirk apontou).
 * Agora a fonte é o bucket.
 */

const ROTULO_GAVETA = {
  mensal: 'mensal',
  diario: 'diário',
};

export default function BackupPainel() {
  const [backups, setBackups] = useState([]);
  const [auditoria, setAuditoria] = useState([]);
  const [restauracaoDisponivel, setRestauracaoDisponivel] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [rodando, setRodando] = useState(false);
  const [baixando, setBaixando] = useState(null);
  const [restaurando, setRestaurando] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, log] = await Promise.all([
        api.get('/plataforma/backups'),
        api.get('/plataforma/backups/auditoria'),
      ]);
      setBackups(lista.data.backups);
      setRestauracaoDisponivel(lista.data.restauracaoDisponivel);
      setAuditoria(log.data);
    } catch (erro) {
      toast.error(erro.response?.data?.error || 'Não consegui carregar os backups.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function dispararBackup() {
    setRodando(true);
    try {
      await api.post('/plataforma/backup');
      toast.success('Backup iniciado. Ele aparece na lista quando o Firestore terminar.');
      // O export leva alguns segundos até gravar o primeiro objeto; recarregar
      // na hora mostraria a lista sem ele e pareceria que nada aconteceu.
      setTimeout(carregar, 6000);
    } catch (erro) {
      toast.error(erro.response?.data?.error || 'Não consegui iniciar o backup.');
    } finally {
      setRodando(false);
    }
  }

  /**
   * Baixa o .zip pela API, autenticado — mesmo caminho do anexo de chamado.
   * Sem URL pública nem link assinado: o arquivo vem pelo Bearer do operador.
   */
  async function baixar(backup) {
    setBaixando(backup.id);
    try {
      const resposta = await api.get(`/plataforma/backups/${backup.id}`, { responseType: 'blob' });

      const url = URL.createObjectURL(resposta.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${backup.id.replace(/\//g, '_')}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Não consegui baixar este backup.');
    } finally {
      setBaixando(null);
    }
  }

  const totalMb = backups.reduce((soma, b) => soma + b.megabytes, 0);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center flex-shrink-0">
            <DatabaseBackup className="w-4 h-4 text-brand-dark" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Backup do banco</p>
            <p className="text-xs text-muted mt-0.5">
              Export nativo do Firestore para bucket privado em São Paulo. Automático todo dia às
              02:00 — diários guardados por <strong>30 dias</strong>, e o do dia 1 de cada mês por
              <strong> 1 ano</strong>.
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={carregar}
              disabled={carregando}
              className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-alt transition-colors"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={dispararBackup}
              disabled={rodando}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              {rodando ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseBackup className="w-4 h-4" />}
              {rodando ? 'Iniciando...' : 'Fazer backup agora'}
            </button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          {carregando && !backups.length ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-faint" /></div>
          ) : backups.length === 0 ? (
            <p className="text-sm text-muted py-6 text-center">Nenhum backup no bucket ainda.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {backups.length} backup(s) guardado(s)
                </p>
                <p className="text-xs text-faint">{totalMb.toFixed(1)} MB no total</p>
              </div>

              <ul className="divide-y divide-border">
                {backups.map((b) => (
                  <LinhaDeBackup
                    key={b.id}
                    backup={b}
                    baixando={baixando === b.id}
                    onBaixar={() => baixar(b)}
                    onRestaurar={() => setRestaurando(b)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>

        <p className="mt-3 pt-3 border-t border-border text-xs text-faint flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          Falha de rotina automática (backup, exclusões da LGPD, faturas) aparece como aviso no topo
          da aba Chamados.
        </p>
      </div>

      <LogDeAcoes registros={auditoria} />

      {restaurando && (
        <ModalRestaurar
          backup={restaurando}
          disponivel={restauracaoDisponivel}
          onFechar={() => setRestaurando(null)}
          onRestaurou={async () => { setRestaurando(null); await carregar(); }}
        />
      )}
    </div>
  );
}

function LinhaDeBackup({ backup, baixando, onBaixar, onRestaurar }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink font-medium truncate">
          {backup.criadoEm ? new Date(backup.criadoEm).toLocaleString('pt-BR') : backup.id}
        </p>
        <p className="text-xs text-faint font-mono truncate">{backup.id}</p>
      </div>

      <span
        className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0
                    ${backup.gaveta === 'mensal'
          ? 'bg-brand-light text-brand-dark'
          : 'bg-surface-alt text-muted'}`}
      >
        {ROTULO_GAVETA[backup.gaveta] || backup.gaveta}
      </span>

      {/* `completo` vem da presença do .overall_export_metadata, que o
          Firestore só grava quando o export terminou. Um export interrompido
          exibido como válido seria a pior mentira desta tela. */}
      {backup.completo ? (
        <span className="text-xs text-income flex items-center gap-1 flex-shrink-0" title="Export concluído">
          <CheckCircle2 className="w-3.5 h-3.5" /> íntegro
        </span>
      ) : (
        <span className="text-xs text-amber-700 flex items-center gap-1 flex-shrink-0" title="O export não terminou">
          <AlertTriangle className="w-3.5 h-3.5" /> incompleto
        </span>
      )}

      <span className="text-xs text-muted tabular-nums flex-shrink-0 w-16 text-right">
        {backup.megabytes} MB
      </span>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={onBaixar}
          disabled={baixando}
          className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-alt transition-colors"
          title="Baixar em .zip"
        >
          {baixando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={onRestaurar}
          disabled={!backup.completo}
          className={`p-1.5 rounded-lg transition-colors
                      ${backup.completo
            ? 'text-muted hover:text-expense hover:bg-surface-alt'
            : 'text-faint'}`}
          title={backup.completo ? 'Restaurar este backup' : 'Backup incompleto não pode ser restaurado'}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}

const ROTULO_ACAO = {
  backup_manual: 'Backup manual',
  backup_baixado: 'Backup baixado',
  restauracao_tentada: 'Restauração tentada',
  restauracao_executada: 'RESTAURAÇÃO EXECUTADA',
  restauracao_recusada: 'Restauração recusada',
};

/** Quem mexeu no banco inteiro, quando e com que resultado. */
function LogDeAcoes({ registros }) {
  if (!registros?.length) return null;

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-brand-dark" />
        <p className="text-sm font-semibold text-ink">Histórico de ações</p>
      </div>

      <ul className="divide-y divide-border">
        {registros.map((r) => {
          const executada = r.acao === 'restauracao_executada';
          const recusada = r.acao === 'restauracao_recusada';

          return (
            <li key={r.id} className="flex items-start gap-3 py-2 text-sm">
              <Clock className="w-3.5 h-3.5 text-faint flex-shrink-0 mt-1" />

              <div className="min-w-0 flex-1">
                <p className={`font-medium ${executada ? 'text-expense' : recusada ? 'text-amber-700' : 'text-ink'}`}>
                  {ROTULO_ACAO[r.acao] || r.acao}
                </p>
                <p className="text-xs text-muted truncate">
                  {r.adminEmail || r.adminUid}
                  {r.detalhes?.backup ? ` · ${r.detalhes.backup}` : ''}
                  {r.detalhes?.motivo ? ` · ${r.detalhes.motivo}` : ''}
                </p>
                {r.detalhes?.backupDeSeguranca && (
                  <p className="text-xs text-faint font-mono">
                    segurança: {r.detalhes.backupDeSeguranca}
                  </p>
                )}
              </div>

              <span className="text-xs text-faint flex-shrink-0">
                {r.createdAt ? new Date(r.createdAt).toLocaleString('pt-BR') : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Restauração — a confirmação mais séria do sistema.
 *
 * Três barreiras, e nenhuma é decoração: a senha de restauração (que NÃO é a
 * do login), a repetição da identificação do backup, e o aviso sobre a
 * semântica de FUSÃO. Esta última é a que mais importa: quem clica achando que
 * o banco "volta no tempo" vai encontrar um estado que nunca existiu.
 */
function ModalRestaurar({ backup, disponivel, onFechar, onRestaurou }) {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [entendi, setEntendi] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const podeEnviar = disponivel && entendi && !!senha && confirmacao === backup.id && !enviando;

  async function restaurar(evento) {
    evento.preventDefault();
    if (!podeEnviar) return;

    setEnviando(true);
    try {
      const { data } = await api.post('/plataforma/backups/restaurar', {
        backup: backup.id, senha, confirmacao,
      });
      toast.success(`Restauração iniciada. Backup de segurança: ${data.backupDeSeguranca}`);
      await onRestaurou();
    } catch (erro) {
      toast.error(erro.response?.data?.error || 'Não consegui restaurar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60" onClick={onFechar}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-expense" />
            <h3 className="font-bold text-ink">Restaurar backup</h3>
          </div>
          <button type="button" onClick={onFechar} className="text-muted hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={restaurar} className="px-5 py-4 space-y-4">
          <div className="border border-red-200 bg-red-50 rounded-card px-3 py-2.5 space-y-2">
            <p className="text-sm font-semibold text-expense">
              Isto escreve por cima do banco de produção.
            </p>
            <p className="text-xs text-ink">
              O import do Firestore é uma <strong>fusão</strong>, não uma substituição: documentos
              do backup sobrescrevem os atuais, e o que foi criado <strong>depois</strong> do
              backup continua onde está. O banco não volta a ser o que era — ele vira a soma dos
              dois.
            </p>
            <p className="text-xs text-ink">
              Um <strong>backup de segurança do estado atual</strong> é feito automaticamente antes
              de qualquer escrita, então dá para voltar atrás.
            </p>
          </div>

          <div className="text-sm">
            <p className="text-muted text-xs">Backup escolhido</p>
            <p className="font-mono text-ink break-all">{backup.id}</p>
            <p className="text-xs text-muted mt-0.5">
              {backup.criadoEm ? new Date(backup.criadoEm).toLocaleString('pt-BR') : ''}
              {` · ${backup.megabytes} MB · ${backup.arquivos} arquivos`}
            </p>
          </div>

          {!disponivel && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-card px-3 py-2">
              A restauração está desligada: o segredo BACKUP_RESTORE_SENHA não foi configurado
              neste ambiente. Sem ele o botão não funciona — de propósito.
            </p>
          )}

          <div>
            <label className="label">Repita a identificação do backup</label>
            <input
              className="input font-mono text-xs"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              placeholder={backup.id}
              autoComplete="off"
              disabled={!disponivel}
            />
          </div>

          <div>
            <label className="label">Senha de restauração</label>
            <input
              type="password"
              className="input"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="off"
              disabled={!disponivel}
            />
            <p className="text-xs text-faint mt-1">
              É uma senha separada, só para esta ação — não é a do seu login.
            </p>
          </div>

          <label className={`flex items-start gap-2 text-sm ${disponivel ? 'cursor-pointer' : 'text-faint'}`}>
            <input
              type="checkbox"
              checked={entendi}
              onChange={(e) => setEntendi(e.target.checked)}
              disabled={!disponivel}
              className="mt-0.5"
            />
            Entendi que isto altera o banco de produção e que a operação é uma fusão.
          </label>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={!podeEnviar}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                          ${podeEnviar ? 'bg-expense text-white hover:opacity-90' : 'bg-surface-alt text-faint'}`}
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              {enviando ? 'Restaurando...' : 'Restaurar mesmo assim'}
            </button>
            <button type="button" onClick={onFechar} className="text-sm text-muted hover:text-ink ml-auto">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
