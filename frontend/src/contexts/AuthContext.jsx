import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
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

  const logout = useCallback(async () => {
    await signOut(auth);
    localStorage.removeItem('@financeiro:token');
    setUser(null);
  }, []);

  const updateUser = useCallback((updatedUser) => {
    setUser((prev) => ({ ...prev, ...updatedUser }));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
