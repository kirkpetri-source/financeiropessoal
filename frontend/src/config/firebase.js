import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// Os valores caem para o projeto de PRODUÇÃO quando nada é definido, então
// nenhum build existente muda de comportamento. As variáveis existem para
// apontar o app ao projeto de homologação sem editar este arquivo — editar e
// esquecer de reverter é exatamente a armadilha que já desligou o App Check em
// produção uma vez (regra 14 do projeto).
//
// A apiKey do Firebase Web não é segredo: ela vai no bundle e é pública por
// design. Quem protege o dado são as regras do Firestore e a autenticação.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyA9_AFJLPgAZF60s4nbu6Q5_SgqEkNqj1c',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'financeiropessoal-29b32.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'financeiropessoal-29b32',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'financeiropessoal-29b32.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID || '137963747650',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:137963747650:web:1aac2bfea281c5aec5f0db',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// App Check só liga quando existir um site key do reCAPTCHA v3 (gerado no
// console — não é automatizável por CLI). Sem VITE_RECAPTCHA_SITE_KEY, o app
// funciona normalmente sem essa camada extra; o backend (APP_CHECK_ENFORCE)
// também continua desligado até então, então nenhum cliente fica bloqueado
// no meio do caminho.
//
// Exportado para o interceptor de api.js poder pegar o token e mandar no
// header X-Firebase-Appcheck — App Check só anexa esse header sozinho em
// chamadas feitas pelo SDK do Firebase (Firestore, Functions callable), não
// numa API Express própria como esta.
export let appCheckInstance = null;
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (recaptchaSiteKey) {
  appCheckInstance = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export default app;
