import axios from 'axios';

const FUNCTIONS_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: FUNCTIONS_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Injeta o token do Firebase em todas as requisições
api.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('@financeiro:token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // App Check só existe quando VITE_RECAPTCHA_SITE_KEY está configurado (ver
  // config/firebase.js). O SDK não anexa esse header sozinho numa API Express
  // própria — só em chamadas feitas por outros SDKs do Firebase.
  const { appCheckInstance } = await import('../config/firebase');
  if (appCheckInstance) {
    try {
      const { getToken } = await import('firebase/app-check');
      const { token: appCheckToken } = await getToken(appCheckInstance, false);
      config.headers['X-Firebase-Appcheck'] = appCheckToken;
    } catch {
      // Sem o header, a chamada segue normal — falha do lado do servidor
      // (com mensagem clara) é melhor que travar o app aqui na hora de montar
      // a requisição.
    }
  }

  return config;
});

// Evento avisando que o backend recusou uma gravação por assinatura vencida.
// O AssinaturaContext escuta e recarrega a situação, para o banner aparecer no
// mesmo instante em que o botão falha — sem isso a tela continuaria dizendo
// "trial ativo" enquanto o backend já estava bloqueando.
export const EVENTO_ASSINATURA_INATIVA = 'assinatura:inativa';

// Redireciona para login se token expirar
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 402) {
      window.dispatchEvent(new CustomEvent(EVENTO_ASSINATURA_INATIVA, {
        detail: error.response.data,
      }));
    }

    if (error.response?.status === 401) {
      // Tenta renovar o token antes de deslogar
      try {
        const { auth } = await import('../config/firebase');
        const firebaseUser = auth.currentUser;
        if (firebaseUser) {
          const newToken = await firebaseUser.getIdToken(true);
          localStorage.setItem('@financeiro:token', newToken);
          error.config.headers.Authorization = `Bearer ${newToken}`;
          return axios(error.config);
        }
      } catch {
        // se falhar, desloga
      }
      localStorage.removeItem('@financeiro:token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
