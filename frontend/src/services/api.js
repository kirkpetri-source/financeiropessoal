import axios from 'axios';

const FUNCTIONS_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: FUNCTIONS_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Injeta o token do Firebase em todas as requisições
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('@financeiro:token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redireciona para login se token expirar
api.interceptors.response.use(
  (response) => response,
  async (error) => {
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
