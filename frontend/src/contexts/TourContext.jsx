import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Joyride, { STATUS, ACTIONS, EVENTS } from 'react-joyride';
import { useAuth } from './AuthContext';

/**
 * Tour guiado de primeiro uso.
 *
 * Atravessa várias páginas (Configurações → Dashboard → Lançamentos →
 * Categorias → WhatsApp → Relatório), então cada passo é um Joyride
 * independente (array de 1 item, sempre no índice 0): quem controla a
 * progressão real é este contexto, via `stepIndex`. Isso evita depender do
 * Joyride pra navegar entre rotas, que ele não sabe fazer sozinho.
 *
 * Guardado em localStorage por uid, não no backend: é preferência de
 * dispositivo, não dado de família — não precisa de sincronização nem de
 * mexer no schema do Firestore por uma tela de ajuda.
 */

const PASSOS = [
  {
    path: '/dashboard',
    target: 'body',
    placement: 'center',
    title: 'Bem-vindo(a) ao RevelaCash',
    content: 'Vamos te mostrar rapidinho como tudo funciona — leva menos de um minuto.',
  },
  {
    path: '/settings',
    search: '?tab=familia',
    target: '#tour-whatsapp-mode',
    placement: 'right',
    title: 'Primeiro passo: como você vai usar',
    content: 'Escolha se vai lançar sozinho ou com mais pessoas, e conecte seu WhatsApp aqui. É o que faz o resto do sistema funcionar.',
  },
  {
    path: '/dashboard',
    target: '.dash-topbar',
    placement: 'bottom',
    title: 'Seu painel financeiro',
    content: 'Aqui você acompanha receitas, despesas e saldo, atualizados sozinhos conforme você lança pelo WhatsApp.',
  },
  {
    path: '/transactions',
    target: '#tour-transactions',
    placement: 'top',
    title: 'Lançamentos',
    content: 'Todo gasto ou recebimento enviado pelo WhatsApp aparece aqui, já organizado.',
  },
  {
    path: '/categories',
    target: '#tour-categories',
    placement: 'top',
    title: 'Categorias',
    content: 'Aqui você ajusta as categorias que organizam automaticamente seus lançamentos.',
  },
  {
    path: '/whatsapp-logs',
    target: '#tour-whatsapp-logs',
    placement: 'top',
    title: 'Mensagens do WhatsApp',
    content: 'O histórico de mensagens trocadas com o sistema fica registrado aqui, caso precise conferir algo.',
  },
  {
    path: '/dashboard',
    target: '#tour-relatorio-btn',
    placement: 'bottom',
    title: 'Gerar relatórios',
    content: 'Pronto! Clique aqui sempre que quiser um resumo completo do mês. Tour concluído — bom uso!',
  },
];

const TourContext = createContext(null);

function chaveVista(uid) {
  return `revelacash_tour_visto_${uid}`;
}

function useElementReady(selector, active) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    if (!active || !selector) return undefined;

    let frame;
    let tentativas = 0;
    function checar() {
      tentativas += 1;
      if (selector === 'body' || document.querySelector(selector)) {
        setReady(true);
        return;
      }
      // Não insiste pra sempre: um alvo condicional (ex: mensalidade sem
      // dados ainda) que nunca aparece não pode travar o tour.
      if (tentativas < 300) frame = requestAnimationFrame(checar);
    }
    checar();
    return () => cancelAnimationFrame(frame);
  }, [selector, active]);

  return ready;
}

export function TourProvider({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const passo = PASSOS[stepIndex];
  const naRotaCerta = run
    && location.pathname === passo.path
    && (location.search || '') === (passo.search || '');

  // Navega para a rota do passo atual sempre que ele muda.
  useEffect(() => {
    if (!run) return;
    const alvo = passo.path + (passo.search || '');
    const atual = location.pathname + (location.search || '');
    if (atual !== alvo) navigate(alvo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, stepIndex]);

  const targetReady = useElementReady(passo.target, naRotaCerta);

  const marcarVisto = useCallback(() => {
    if (user?.firebaseUid) localStorage.setItem(chaveVista(user.firebaseUid), '1');
  }, [user]);

  const startTour = useCallback(() => {
    setStepIndex(0);
    setRun(true);
  }, []);

  const stopTour = useCallback(() => {
    setRun(false);
    marcarVisto();
  }, [marcarVisto]);

  // Auto-início: só na primeira vez que este navegador vê este usuário logado.
  //
  // Sem ref de trava: o StrictMode do React roda efeito→cleanup→efeito de
  // novo em desenvolvimento, e uma trava setada de forma síncrona (antes do
  // timeout disparar) sobrevive ao cleanup e nunca mais deixa o timer ser
  // reagendado. A trava real é o localStorage, setada só quando o timeout
  // dispara de verdade — o cleanup só cancela o agendamento redundante.
  useEffect(() => {
    if (!user?.firebaseUid) return undefined;
    if (localStorage.getItem(chaveVista(user.firebaseUid))) return undefined;
    const t = setTimeout(() => {
      // Só auto-inicia partindo do /dashboard — que é pra onde login e
      // cadastro normais mandam. Alguém chegando direto num link específico
      // (o painel admin, por exemplo, sem link nenhum no menu) não pode ser
      // arrastado de volta pro dashboard só porque nunca viu o tour neste
      // navegador; sem marcar como visto, ele começa sozinho da próxima vez
      // que a pessoa passar pelo dashboard de verdade.
      if (window.location.pathname !== '/dashboard') return;
      marcarVisto(); // marca já ao iniciar: se a pessoa fechar a aba no meio, não insiste de novo sozinho
      startTour();
    }, 900);
    return () => clearTimeout(t);
  }, [user, marcarVisto, startTour]);

  function handleCallback(data) {
    const { status, action, type } = data;

    // Em modo controlado (stepIndex fixo), o Joyride nunca manda
    // status "finished" sozinho — quem decide que a etapa acabou é o
    // consumidor, reagindo a EVENTS.STEP_AFTER. STATUS.FINISHED só existe
    // aqui pra o caso (não esperado) de o próprio Joyride encerrar sozinho.
    if (status === STATUS.SKIPPED || status === STATUS.FINISHED || action === ACTIONS.CLOSE) {
      stopTour();
      return;
    }

    if (type === EVENTS.STEP_AFTER) {
      const ehUltimoPasso = stepIndex >= PASSOS.length - 1;
      if (action === ACTIONS.NEXT && ehUltimoPasso) {
        stopTour();
      } else {
        setStepIndex((i) => Math.min(PASSOS.length - 1, i + (action === ACTIONS.PREV ? -1 : 1)));
      }
    }
  }

  return (
    <TourContext.Provider value={{ startTour }}>
      {children}
      {naRotaCerta && targetReady && (
        <Joyride
          key={stepIndex}
          steps={[{
            target: passo.target,
            title: passo.title,
            content: passo.content,
            placement: passo.placement,
            disableBeacon: true,
          }]}
          stepIndex={0}
          run
          continuous
          disableScrolling={passo.target === 'body'}
          callback={handleCallback}
          // Sem botão "Pular": o Joyride só renderiza showSkipButton quando
          // !isLastStep, e cada página aqui é montada como array de 1 item —
          // ou seja, sempre "último passo" do ponto de vista dele. O "Fechar"
          // (X, sempre visível) é quem cobre ignorar/dispensar o tour.
          locale={{
            close: 'Fechar',
            last: stepIndex >= PASSOS.length - 1 ? 'Concluir' : 'Próximo',
            next: 'Próximo',
          }}
          styles={{
            options: { primaryColor: '#512b8d', zIndex: 10000, arrowColor: '#fff' },
            tooltip: { borderRadius: 14 },
            buttonNext: { borderRadius: 8 },
            buttonBack: { color: '#6e6a63' },
          }}
        />
      )}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour deve ser usado dentro de TourProvider');
  return ctx;
}
