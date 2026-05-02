import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

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
export default app;
