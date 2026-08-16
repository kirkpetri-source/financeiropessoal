import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, FileText, AlertTriangle, CheckCircle2, Undo2, Info,
  ArrowRightLeft, CalendarClock, Wand2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useImportacao } from '../hooks/useImportacao';
import { useCategories } from '../hooks/useCategories';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { formatCurrency } from '../utils/formatters';

/**
 * Importação de extrato bancário.
 *
 * A tela é construída em torno de uma ideia: a pessoa precisa entender o que
 * vai acontecer ANTES de acontecer. Por isso o preview mostra mês a mês quanto
 * já existe, quanto entraria e como o total fica depois — e deixa desmarcado
 * por padrão tudo que parece já existir. O caminho preguiçoso (clicar em
 * confirmar sem revisar) é o caminho seguro.
 */

function Rotulo({ children, tom = 'neutro' }) {
  const tons = {
    neutro: 'bg-surface-alt text-muted',
    alerta: 'bg-amber-50 text-amber-700',
    perigo: 'bg-red-50 text-red-600',
    ok: 'bg-emerald-50 text-emerald-700',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tons[tom]}`}>{children}</span>;
}

function ResumoDoMes({ mes }) {
  const comDados = mes.risco === 'com_dados';

  return (
    <div className="border border-border rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-semibold text-ink">{mes.mes}</span>
        {comDados
          ? <Rotulo tom="alerta">Já tem {mes.jaExiste.quantidade} lançamento(s)</Rotulo>
          : <Rotulo tom="ok">Mês livre</Rotulo>}
      </div>

      <dl className="text-xs text-muted space-y-1">
        <div className="flex justify-between">
          <dt>No extrato</dt>
          <dd className="text-ink">{mes.quantidade} lançamento(s) · {formatCurrency(mes.totalGastos)}</dd>
        </div>
        {comDados && (
          <>
            <div className="flex justify-between">
              <dt>Já lançado no sistema</dt>
              <dd className="text-ink">{formatCurrency(mes.jaExiste.totalGastos)}</dd>
            </div>
            <div className="flex justify-between font-medium">
              <dt className="text-ink">Total de gastos depois</dt>
              <dd className="text-ink">{formatCurrency(mes.totalGastosDepois)}</dd>
            </div>
          </>
        )}
        {mes.provaveisDuplicatas > 0 && (
          <div className="flex justify-between text-amber-700">
            <dt>Parecem repetidos</dt>
            <dd>{mes.provaveisDuplicatas} (desmarcados)</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export default function ImportarExtratoPage() {
  const inputRef = useRef(null);
  const { preview, setPreview, analisar, analisando, confirmar, confirmando, desfazer, lotes, listarLotes } = useImportacao();
  const { categories, fetchCategories } = useCategories();

  const [selecionados, setSelecionados] = useState({});
  const [categoriasEscolhidas, setCategoriasEscolhidas] = useState({});
  const [resultado, setResultado] = useState(null);
  const [desfazendo, setDesfazendo] = useState(null);
  const [desfazendoAgora, setDesfazendoAgora] = useState(false);

  useEffect(() => {
    fetchCategories();
    listarLotes();
  }, [fetchCategories, listarLotes]);

  // Seleção inicial: entra tudo, menos o que já foi importado, o que parece
  // repetido e o que parece transferência entre contas próprias. Quem quiser
  // qualquer um deles marca de propósito.
  useEffect(() => {
    if (!preview) return;
    const inicial = {};
    preview.linhas.forEach((linha, i) => {
      inicial[i] = !linha.jaImportada && !linha.provavelDuplicata && !linha.ehTransferencia;
    });
    setSelecionados(inicial);
    setCategoriasEscolhidas({});
    setResultado(null);
  }, [preview]);

  const totais = useMemo(() => {
    if (!preview) return { marcados: 0, valor: 0 };
    let marcados = 0;
    let valor = 0;
    preview.linhas.forEach((linha, i) => {
      if (!selecionados[i]) return;
      marcados += 1;
      valor += linha.tipo === 'EXPENSE' ? linha.valor : 0;
    });
    return { marcados, valor };
  }, [preview, selecionados]);

  const categoriasPorTipo = useMemo(() => ({
    EXPENSE: categories.filter((c) => !c.type || c.type === 'EXPENSE'),
    INCOME: categories.filter((c) => !c.type || c.type === 'INCOME'),
  }), [categories]);

  async function aoEscolherArquivo(evento) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    try {
      await analisar(arquivo);
    } catch {
      // toast já mostrado no hook
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function alternar(indice) {
    setSelecionados((atual) => ({ ...atual, [indice]: !atual[indice] }));
  }

  function aplicarNoLote(lote, categoria) {
    if (!categoria) return;
    setCategoriasEscolhidas((atual) => {
      const novo = { ...atual };
      lote.indices.forEach((i) => { novo[i] = categoria; });
      return novo;
    });
    setSelecionados((atual) => {
      const novo = { ...atual };
      lote.indices.forEach((i) => {
        if (!preview.linhas[i].jaImportada) novo[i] = true;
      });
      return novo;
    });
    toast.success(`${lote.indices.length} lançamento(s) marcados como ${categoria}.`);
  }

  async function aoConfirmar() {
    const escolhas = preview.linhas
      .map((linha, indice) => ({ linha, indice }))
      .filter(({ indice }) => selecionados[indice])
      .map(({ linha, indice }) => ({
        indice,
        categoria: categoriasEscolhidas[indice] || linha.categoriaSugerida || undefined,
      }));

    if (!escolhas.length) {
      toast.error('Marque ao menos um lançamento.');
      return;
    }

    try {
      const r = await confirmar(preview.id, escolhas);
      setResultado(r);
      setPreview(null);
      listarLotes();
      toast.success(`${r.totalCriadas} lançamento(s) importado(s).`);
    } catch {
      // toast já mostrado no hook
    }
  }

  async function aoDesfazer() {
    setDesfazendoAgora(true);
    try {
      await desfazer(desfazendo.id);
      setDesfazendo(null);
      setResultado(null);
      listarLotes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não consegui desfazer.');
    } finally {
      setDesfazendoAgora(false);
    }
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div>
        <h1 className="text-lg font-semibold text-ink">Importar extrato do banco</h1>
        <p className="text-sm text-muted">
          Traga seu histórico de meses anteriores de uma vez, em vez de digitar lançamento por lançamento.
        </p>
      </div>

      {/* Regra que mais gera dúvida: por que o mês atual não aparece. */}
      <div className="card bg-surface-alt/60 flex gap-3">
        <Info className="w-4 h-4 text-brand-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-muted space-y-1">
          <p><strong className="text-ink">Só mês já fechado.</strong> O mês em andamento fica de fora porque é onde seus lançamentos pelo WhatsApp estão entrando — importar os dois criaria lançamento repetido.</p>
          <p>Aceita arquivo <strong className="text-ink">OFX</strong> ou <strong className="text-ink">CSV</strong>, do jeito que o banco exporta. Nada é gravado antes de você conferir e confirmar, e dá para desfazer a importação inteira depois.</p>
        </div>
      </div>

      {/* Upload */}
      {!preview && (
        <div className="card">
          <input
            ref={inputRef}
            type="file"
            accept=".ofx,.csv,.txt,text/csv,application/x-ofx"
            onChange={aoEscolherArquivo}
            className="hidden"
            id="arquivo-extrato"
          />
          <label
            htmlFor="arquivo-extrato"
            className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors"
          >
            {analisando ? (
              <>
                <LoadingSpinner size="lg" />
                <span className="text-sm text-muted">Lendo o extrato…</span>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 text-brand-600" />
                <span className="text-sm font-medium text-ink">Escolher arquivo do extrato</span>
                <span className="text-xs text-faint">OFX ou CSV · até 2.000 lançamentos por arquivo</span>
              </>
            )}
          </label>
        </div>
      )}

      {/* Resultado da última importação */}
      {resultado && (
        <div className="card border-emerald-200 bg-emerald-50/50">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-ink">{resultado.totalCriadas} lançamento(s) importado(s).</p>
              {resultado.totalPuladas > 0 && (
                <p className="text-xs text-muted mt-1">
                  {resultado.totalPuladas} não entraram por já existirem ou estarem fora do período permitido.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <>
          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-600" />
              <span className="text-sm font-medium text-ink">{preview.arquivo?.nome || 'Extrato'}</span>
              <Rotulo>{preview.arquivo?.formato?.toUpperCase()}</Rotulo>
              {preview.periodo && (
                <span className="text-xs text-faint">{preview.periodo.de} a {preview.periodo.ate}</span>
              )}
            </div>

            {preview.recusadas && (
              <div className="flex gap-2 text-xs bg-amber-50 text-amber-800 rounded-lg p-2.5">
                <CalendarClock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  {preview.recusadas.total} lançamento(s) ficaram de fora. {preview.recusadas.explicacao}
                </span>
              </div>
            )}

            {preview.jaImportadas > 0 && (
              <div className="flex gap-2 text-xs bg-surface-alt text-muted rounded-lg p-2.5">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{preview.jaImportadas} lançamento(s) deste arquivo já foram importados antes e não entram de novo.</span>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              {preview.meses.map((mes) => <ResumoDoMes key={mes.mes} mes={mes} />)}
            </div>
          </div>

          {/* Classificação em massa */}
          {preview.lotes?.length > 0 && (
            <div className="card space-y-2">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-brand-600" />
                <h2 className="text-sm font-semibold text-ink">Classificar de uma vez</h2>
              </div>
              <p className="text-xs text-muted">
                Lançamentos do mesmo tipo de operação. Escolher a categoria aqui vale para todos eles.
              </p>
              {preview.lotes.slice(0, 6).map((lote) => (
                <div key={lote.id} className="flex flex-wrap items-center gap-2 py-1.5 border-b border-border last:border-0">
                  <span className="text-sm text-ink flex-1 min-w-0 truncate">{lote.prefixo}</span>
                  <span className="text-xs text-faint whitespace-nowrap">{lote.quantidade}x · {formatCurrency(lote.total)}</span>
                  <select
                    className="input py-1 text-xs w-auto"
                    defaultValue=""
                    onChange={(e) => aplicarNoLote(lote, e.target.value)}
                  >
                    <option value="">Categoria…</option>
                    {categoriasPorTipo[lote.tipo]?.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* Linhas */}
          <div className="card">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-ink">Lançamentos do extrato</h2>
              <span className="text-xs text-muted">{totais.marcados} marcado(s) · {formatCurrency(totais.valor)} em gastos</span>
            </div>

            <div className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
              {preview.linhas.map((linha, indice) => (
                <div
                  key={`${linha.digital}-${indice}`}
                  className={`flex items-start gap-2.5 p-2 rounded-lg ${linha.jaImportada ? 'opacity-50' : 'hover:bg-surface-alt'}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={!!selecionados[indice]}
                    disabled={linha.jaImportada}
                    onChange={() => alternar(indice)}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-ink truncate">{linha.descricaoLimpa}</span>
                      {linha.jaImportada && <Rotulo>Já importado</Rotulo>}
                      {linha.provavelDuplicata && <Rotulo tom="alerta">Parece repetido</Rotulo>}
                      {linha.ehTransferencia && <Rotulo tom="neutro">Transferência</Rotulo>}
                    </div>

                    <div className="text-xs text-faint flex items-center gap-2 flex-wrap">
                      <span>{linha.data}</span>
                      {linha.provavelDuplicata && (
                        <span className="text-amber-700 flex items-center gap-1">
                          <ArrowRightLeft className="w-3 h-3" />
                          já existe: “{linha.provavelDuplicata.descricao}” em {linha.provavelDuplicata.data}
                        </span>
                      )}
                    </div>
                  </div>

                  <select
                    className="input py-1 text-xs w-32 flex-shrink-0"
                    value={categoriasEscolhidas[indice] || linha.categoriaSugerida || ''}
                    disabled={linha.jaImportada}
                    onChange={(e) => setCategoriasEscolhidas((atual) => ({ ...atual, [indice]: e.target.value }))}
                  >
                    {categoriasPorTipo[linha.tipo]?.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>

                  <span className={`text-sm font-medium whitespace-nowrap ${linha.tipo === 'EXPENSE' ? 'text-expense' : 'text-income'}`}>
                    {linha.tipo === 'EXPENSE' ? '-' : '+'}{formatCurrency(linha.valor)}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 justify-end mt-4 pt-3 border-t border-border">
              <button onClick={() => setPreview(null)} className="btn-secondary">Cancelar</button>
              <button onClick={aoConfirmar} disabled={confirmando || !totais.marcados} className="btn-primary">
                {confirmando ? 'Importando…' : `Importar ${totais.marcados} lançamento(s)`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Histórico */}
      {!preview && lotes.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-ink mb-2">Importações anteriores</h2>
          <div className="space-y-1">
            {lotes.map((lote) => (
              <div key={lote.id} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink truncate">{lote.arquivo?.nome || 'Extrato'}</p>
                  <p className="text-xs text-faint">
                    {lote.periodo ? `${lote.periodo.de} a ${lote.periodo.ate}` : '—'}
                    {lote.totalCriadas != null && ` · ${lote.totalCriadas} lançamento(s)`}
                  </p>
                </div>
                {lote.status === 'confirmado' && (
                  <button
                    onClick={() => setDesfazendo(lote)}
                    className="text-xs text-muted hover:text-red-600 flex items-center gap-1"
                  >
                    <Undo2 className="w-3.5 h-3.5" /> Desfazer
                  </button>
                )}
                {lote.status === 'desfeito' && <Rotulo>Desfeita</Rotulo>}
                {lote.status === 'rascunho' && <Rotulo tom="alerta">Não concluída</Rotulo>}
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!desfazendo}
        onClose={() => setDesfazendo(null)}
        onConfirm={aoDesfazer}
        loading={desfazendoAgora}
        title="Desfazer esta importação?"
        message={`Os ${desfazendo?.totalCriadas || 0} lançamento(s) criados por ela serão apagados. Lançamentos feitos por você ou pelo WhatsApp não são tocados.`}
      />
    </div>
  );
}
