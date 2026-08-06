import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  CreditCard, CheckCircle2, Loader2, ExternalLink, ShieldCheck, AlertTriangle, Receipt,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAssinatura } from '../contexts/AssinaturaContext';
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters';

const BENEFICIOS = [
  'Lançamento por WhatsApp, no grupo da família',
  'Compra parcelada vira uma parcela por mês, automático',
  'Relatórios e gráficos por categoria e por pessoa',
  'Até 8 pessoas na mesma família',
  'Seus dados são seus: exportação em um clique',
];

const ROTULO_DO_STATUS = {
  trialing: { texto: 'Teste grátis', cor: 'bg-blue-100 text-blue-800' },
  active: { texto: 'Ativa', cor: 'bg-green-100 text-green-800' },
  pending: { texto: 'Aguardando pagamento', cor: 'bg-amber-100 text-amber-800' },
  past_due: { texto: 'Pagamento atrasado', cor: 'bg-red-100 text-red-800' },
  paused: { texto: 'Pausada', cor: 'bg-gray-100 text-gray-700' },
  canceled: { texto: 'Cancelada', cor: 'bg-gray-100 text-gray-700' },
};

export default function AssinaturaPage() {
  const { assinatura, carregou, buscar, iniciarCheckout, sincronizar, cancelar } = useAssinatura();
  const [parametros, setParametros] = useSearchParams();
  const [abrindoCheckout, setAbrindoCheckout] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [eventos, setEventos] = useState([]);

  // Volta do Mercado Pago: o webhook pode não ter chegado ainda, então
  // perguntamos o status direto em vez de mostrar "aguardando" para quem já pagou.
  useEffect(() => {
    if (parametros.get('retorno') !== '1') return;

    sincronizar()
      .then((dados) => {
        if (dados?.podeLancar && !dados.emTrial) toast.success('Assinatura confirmada!');
      })
      .catch(() => toast('Pagamento em processamento. A confirmação chega em instantes.'))
      .finally(() => {
        // Tira o ?retorno=1 da URL para o F5 não disparar a sincronização de novo.
        const limpos = new URLSearchParams(parametros);
        limpos.delete('retorno');
        setParametros(limpos, { replace: true });
      });
  }, [parametros, setParametros, sincronizar]);

  useEffect(() => {
    if (!assinatura?.podeGerir) return;
    api.get('/subscription/eventos').then(({ data }) => setEventos(data)).catch(() => {});
  }, [assinatura?.podeGerir, assinatura?.status]);

  async function abrirCheckout() {
    setAbrindoCheckout(true);
    try {
      const { linkDePagamento } = await iniciarCheckout();
      if (!linkDePagamento) throw new Error('Link de pagamento não veio.');
      // Mesma aba: o Mercado Pago devolve o cliente para /assinatura?retorno=1,
      // e em aba nova o retorno ficaria numa janela que ele fecha sem olhar.
      window.location.href = linkDePagamento;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível abrir o pagamento.');
      setAbrindoCheckout(false);
    }
  }

  async function confirmarCancelamento() {
    setCancelando(true);
    try {
      await cancelar(motivo);
      setConfirmandoCancelamento(false);
      setMotivo('');
      toast.success('Assinatura cancelada.');
      buscar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cancelar.');
    } finally {
      setCancelando(false);
    }
  }

  if (!carregou) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const preco = (assinatura?.precoMensalCentavos ?? 2490) / 100;
  const rotulo = ROTULO_DO_STATUS[assinatura?.status] || null;
  const temAssinaturaViva = ['active', 'pending', 'past_due'].includes(assinatura?.status);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Situação atual */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Assinatura</h1>
            <p className="text-sm text-gray-500 mt-0.5">{assinatura?.mensagem}</p>
          </div>
          {rotulo && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${rotulo.cor}`}>
              {rotulo.texto}
            </span>
          )}
        </div>

        {assinatura?.expiraEm && (
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2.5">
            <ShieldCheck className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span>
              {assinatura.emTrial ? 'Teste grátis até ' : 'Válida até '}
              <strong>{formatDate(assinatura.expiraEm)}</strong>
              {assinatura.diasRestantes != null && assinatura.diasRestantes >= 0 && (
                <> · {assinatura.diasRestantes} dia(s)</>
              )}
            </span>
          </div>
        )}

        {!assinatura?.podeLancar && (
          <div className="flex gap-2 text-sm text-red-900 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              Novos lançamentos estão bloqueados. Seus dados continuam salvos e você
              pode consultar e <Link to="/settings" className="underline">exportar</Link> tudo
              a qualquer momento.
            </p>
          </div>
        )}
      </div>

      {/* Plano */}
      <div className="card space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-gray-900">{formatCurrency(preco)}</span>
          <span className="text-sm text-gray-500">/ mês, por família</span>
        </div>

        <ul className="space-y-2">
          {BENEFICIOS.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-gray-700">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              {b}
            </li>
          ))}
        </ul>

        {!assinatura?.podeGerir ? (
          <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-3 py-2.5">
            Só quem é dono da família pode contratar ou cancelar a assinatura.
          </p>
        ) : assinatura?.status === 'active' ? (
          <div className="flex items-center gap-2 text-sm text-green-800 bg-green-50 rounded-xl px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            Cobrança mensal ativa no Mercado Pago.
          </div>
        ) : (
          <button
            type="button"
            onClick={abrirCheckout}
            disabled={abrindoCheckout}
            className="btn-primary flex items-center gap-2 w-full justify-center"
          >
            {abrindoCheckout ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Abrindo pagamento...</>
            ) : (
              <><CreditCard className="w-4 h-4" /> Assinar por {formatCurrency(preco)}/mês</>
            )}
          </button>
        )}

        {assinatura?.podeGerir && assinatura?.status === 'pending' && (
          <button
            type="button"
            onClick={() => sincronizar().then(() => toast.success('Status atualizado.')).catch(() => toast.error('Não foi possível consultar agora.'))}
            className="btn-secondary text-sm w-full flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Já paguei — atualizar status
          </button>
        )}

        <p className="text-xs text-gray-400">
          Pagamento processado pelo Mercado Pago. Cancele quando quiser — o acesso
          continua até o fim do período já pago. Ao assinar você concorda com os{' '}
          <Link to="/termos" className="underline">termos de uso</Link> e a{' '}
          <Link to="/privacidade" className="underline">política de privacidade</Link>.
        </p>
      </div>

      {/* Histórico de cobrança */}
      {assinatura?.podeGerir && eventos.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <Receipt className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Histórico de cobrança</h2>
          </div>
          <div className="space-y-2">
            {eventos.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-gray-900 truncate">{descreverEvento(e)}</p>
                  <p className="text-xs text-gray-400">{formatDateTime(e.createdAt)}</p>
                </div>
                {e.valorCentavos != null && (
                  <span className="text-gray-600 flex-shrink-0">
                    {formatCurrency(e.valorCentavos / 100)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancelamento */}
      {assinatura?.podeGerir && temAssinaturaViva && (
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Cancelar assinatura</h2>
          {!confirmandoCancelamento ? (
            <>
              <p className="text-sm text-gray-500">
                A cobrança para na hora e o acesso continua até o fim do período já pago.
                Nenhum lançamento é apagado.
              </p>
              <button
                type="button"
                onClick={() => setConfirmandoCancelamento(true)}
                className="btn-secondary text-sm text-red-600 border-red-200 hover:bg-red-50"
              >
                Quero cancelar
              </button>
            </>
          ) : (
            <>
              <label className="label">O que faltou? (opcional)</label>
              <input
                className="input"
                value={motivo}
                onChange={(ev) => setMotivo(ev.target.value)}
                placeholder="Ex: não usei tanto quanto imaginei"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirmarCancelamento}
                  disabled={cancelando}
                  className="btn-danger text-sm flex items-center gap-2"
                >
                  {cancelando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Confirmar cancelamento
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoCancelamento(false)}
                  className="btn-secondary text-sm"
                >
                  Voltar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function descreverEvento(evento) {
  switch (evento.tipo) {
    case 'checkout_criado': return 'Pagamento iniciado';
    case 'pagamento':
      return evento.status === 'processed' ? 'Mensalidade paga' : 'Cobrança não aprovada — nova tentativa';
    case 'cancelamento': return 'Assinatura cancelada';
    default: return evento.tipo;
  }
}
