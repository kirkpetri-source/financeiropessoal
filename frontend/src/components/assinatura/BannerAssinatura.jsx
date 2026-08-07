import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, Lock } from 'lucide-react';
import { useAssinatura } from '../../contexts/AssinaturaContext';

/**
 * Faixa de aviso no topo do app.
 *
 * Só aparece quando há algo a fazer. Banner permanente de "assine agora" em
 * quem já assinou é ruído que treina o cliente a ignorar avisos — e aí o aviso
 * que importa (cartão recusado) passa batido.
 */

const ESTILOS = {
  info: 'bg-violet-50 border-violet-200 text-violet-900',
  alerta: 'bg-amber-50 border-amber-200 text-amber-900',
  erro: 'bg-red-50 border-red-200 text-red-900',
};

function decidirAviso(assinatura) {
  if (!assinatura) return null;

  if (!assinatura.podeLancar) {
    return { tom: 'erro', Icone: Lock, texto: assinatura.mensagem, acao: 'Assinar agora' };
  }

  if (assinatura.emCarencia) {
    return { tom: 'erro', Icone: AlertTriangle, texto: assinatura.mensagem, acao: 'Regularizar' };
  }

  if (assinatura.emTrial && assinatura.diasRestantes != null) {
    // Nos últimos 5 dias, tom de urgência — antes disso, só um informativo
    // discreto: a pessoa ainda está conhecendo o produto.
    if (assinatura.diasRestantes <= 5) {
      return { tom: 'alerta', Icone: Clock, texto: assinatura.mensagem, acao: 'Assinar' };
    }
    const dias = assinatura.diasRestantes;
    return {
      tom: 'info',
      Icone: Clock,
      texto: `Você está no período de teste grátis — ${dias} dia${dias === 1 ? '' : 's'} restante${dias === 1 ? '' : 's'}.`,
      acao: 'Ativar assinatura',
    };
  }

  return null;
}

export default function BannerAssinatura() {
  const { assinatura, carregou } = useAssinatura();
  if (!carregou) return null;

  const aviso = decidirAviso(assinatura);
  if (!aviso) return null;

  const { tom, Icone, texto, acao } = aviso;

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b text-sm ${ESTILOS[tom]}`}>
      <Icone className="w-4 h-4 flex-shrink-0" />
      <p className="flex-1 min-w-0">{texto}</p>
      <Link
        to="/assinatura"
        className="flex-shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
      >
        {acao}
      </Link>
    </div>
  );
}

export { decidirAviso };
