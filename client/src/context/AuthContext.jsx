import { createContext, useContext, useState, useCallback } from 'react';
import { login as loginApi, logout as logoutApi } from '../api/auth.api.js';

const AuthContext = createContext(null);

const parseStoredUser = () => {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(parseStoredUser);

  const login = useCallback(async (email, password) => {
    const { data } = await loginApi({ email, password });
    const { accessToken, refreshToken, user: userData } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(async () => {
    try { await logoutApi(); } catch { /* ignore */ }
    localStorage.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
