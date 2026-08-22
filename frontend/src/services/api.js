import axios from 'axios';

const FUNCTIONS_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: FUNCTIONS_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Cada lado do sistema tem seu token: o painel da família usa a sessão do app
// padrão; o portal do operador (/plataforma) usa o app nomeado 'plataforma'
// (ver config/firebase.js). As chaves são separadas de propósito — com uma
// chave só, o último login vencia e as requisições da família saíam com o
// token do operador (e vice-versa).
export const CHAVE_TOKEN = '@financeiro:token';
export const CHAVE_TOKEN_PLATAFORMA = '@financeiro:token:plataforma';

/** A requisição é do portal do operador? Decidido pela URL, nunca por estado. */
function ehRotaDePlataforma(url) {
  return String(url || '').replace(/^\//, '').startsWith('plataforma');
}

// Injeta o token do Firebase em todas as requisições
api.interceptors.request.use(async (config) => {
  const chave = ehRotaDePlataforma(config.url) ? CHAVE_TOKEN_PLATAFORMA : CHAVE_TOKEN;
  const token = localStorage.getItem(chave);
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
      const daPlataforma = ehRotaDePlataforma(error.config?.url);

      // Tenta renovar o token antes de deslogar — cada lado com a SUA sessão.
      try {
        const { auth, authPlataforma } = await import('../config/firebase');
        const firebaseUser = (daPlataforma ? authPlataforma : auth).currentUser;
        if (firebaseUser) {
          const newToken = await firebaseUser.getIdToken(true);
          localStorage.setItem(daPlataforma ? CHAVE_TOKEN_PLATAFORMA : CHAVE_TOKEN, newToken);
          error.config.headers.Authorization = `Bearer ${newToken}`;
          return axios(error.config);
        }
      } catch {
        // se falhar, desloga
      }

      if (daPlataforma) {
        // Sessão do OPERADOR expirou. Mandar para /login (o da família) seria
        // misturar os mundos de novo; a própria /plataforma mostra o login dela
        // quando não há sessão.
        localStorage.removeItem(CHAVE_TOKEN_PLATAFORMA);
        window.location.href = '/plataforma';
      } else {
        localStorage.removeItem(CHAVE_TOKEN);
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
