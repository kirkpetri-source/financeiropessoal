import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile as atualizarPerfilDoAuth,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Escuta mudanças de estado do Firebase Auth
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Busca o perfil salvo no Firestore
          const token = await firebaseUser.getIdToken();
          localStorage.setItem('@financeiro:token', token);
          const { data } = await api.get('/auth/me');
          setUser({ ...data, firebaseUid: firebaseUser.uid });
        } catch {
          // Perfil ainda não criado — usuário novo
          setUser({ firebaseUid: firebaseUser.uid, email: firebaseUser.email, name: firebaseUser.displayName });
        }
      } else {
        localStorage.removeItem('@financeiro:token');
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Renovar token automaticamente (expira a cada hora no Firebase)
  useEffect(() => {
    const interval = setInterval(async () => {
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken(true);
        localStorage.setItem('@financeiro:token', token);
      }
    }, 55 * 60 * 1000); // renova a cada 55 minutos

    return () => clearInterval(interval);
  }, []);

  const login = useCallback(async (email, password) => {
    const { user: firebaseUser } = await signInWithEmailAndPassword(auth, email, password);
    const token = await firebaseUser.getIdToken();
    localStorage.setItem('@financeiro:token', token);

    try {
      const { data } = await api.get('/auth/me');
      const profile = { ...data, firebaseUid: firebaseUser.uid };
      setUser(profile);
      return profile;
    } catch {
      // Cria o perfil se não existir
      const { data } = await api.post('/auth/register', {
        name: firebaseUser.displayName || email.split('@')[0],
        email: firebaseUser.email,
      });
      const profile = { ...data, firebaseUid: firebaseUser.uid };
      setUser(profile);
      return profile;
    }
  }, []);

  /**
   * Cadastro.
   *
   * Duas etapas que precisam acontecer juntas: o Firebase cria o login, e o
   * nosso backend cria o perfil e a FAMÍLIA com trial de 7 dias. Sem a
   * segunda, o usuário entra e esbarra em SEM_HOUSEHOLD em toda tela.
   *
   * Se a segunda falhar, apagamos o login recém-criado. Deixar um login órfão
   * é pior que falhar: o e-mail fica "já em uso" e a pessoa não consegue nem
   * tentar de novo.
   */
  const signUp = useCallback(async ({ nome, email, senha, telefone, aceitouTermos }) => {
    const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, senha);

    try {
      await atualizarPerfilDoAuth(firebaseUser, { displayName: nome });

      const token = await firebaseUser.getIdToken(true);
      localStorage.setItem('@financeiro:token', token);

      const { data } = await api.post('/auth/register', { name: nome, email, telefone, aceitouTermos });

      const profile = { ...data, firebaseUid: firebaseUser.uid };
      setUser(profile);
      return profile;
    } catch (err) {
      try { await firebaseUser.delete(); } catch { /* já foi, ou o token expirou */ }
      localStorage.removeItem('@financeiro:token');
      throw err;
    }
  }, []);

  /**
   * Recuperação de senha. Sem isso, quem esquece a senha fica fora da própria
   * conta financeira em definitivo — e a única saída seria pedir socorro por
   * WhatsApp, o que não escala e não é aceitável num serviço pago.
   */
  const resetPassword = useCallback(async (email) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    localStorage.removeItem('@financeiro:token');
    setUser(null);
  }, []);

  /**
   * Troca de senha com reautenticação.
   *
   * Roda inteira no Firebase Auth de propósito: o backend não tem como conferir
   * a senha atual (o Admin SDK só sobrescreve), então validar aqui é o único
   * jeito de exigir mesmo a senha anterior.
   */
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser?.email) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);

    try {
      await reauthenticateWithCredential(firebaseUser, credential);
    } catch (err) {
      if (['auth/wrong-password', 'auth/invalid-credential'].includes(err.code)) {
        throw new Error('Senha atual incorreta.');
      }
      if (err.code === 'auth/too-many-requests') {
        throw new Error('Muitas tentativas. Aguarde alguns minutos e tente de novo.');
      }
      throw err;
    }

    try {
      await updatePassword(firebaseUser, newPassword);
    } catch (err) {
      if (err.code === 'auth/weak-password') {
        throw new Error('Senha fraca. Use no mínimo 6 caracteres.');
      }
      throw err;
    }

    // A senha nova invalida o token antigo — renova para não cair no 401.
    const token = await firebaseUser.getIdToken(true);
    localStorage.setItem('@financeiro:token', token);
  }, []);

  const updateUser = useCallback((updatedUser) => {
    setUser((prev) => ({ ...prev, ...updatedUser }));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, signUp, resetPassword, logout, updateUser, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
