import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: 'AIzaSyA9_AFJLPgAZF60s4nbu6Q5_SgqEkNqj1c',
  authDomain: 'financeiropessoal-29b32.firebaseapp.com',
  projectId: 'financeiropessoal-29b32',
  storageBucket: 'financeiropessoal-29b32.firebasestorage.app',
  messagingSenderId: '137963747650',
  appId: '1:137963747650:web:1aac2bfea281c5aec5f0db',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// App Check só liga quando existir um site key do reCAPTCHA v3 (gerado no
// console — não é automatizável por CLI). Sem VITE_RECAPTCHA_SITE_KEY, o app
// funciona normalmente sem essa camada extra; o backend (APP_CHECK_ENFORCE)
// também continua desligado até então, então nenhum cliente fica bloqueado
// no meio do caminho.
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (recaptchaSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export default app;
