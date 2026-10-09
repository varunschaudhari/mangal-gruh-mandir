import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { login as loginApi, logout as logoutApi, getMe } from '../api/auth.api.js';
import { unregisterPush } from '../utils/push.js';
import { isNative } from '../utils/platform.js';

const AuthContext = createContext(null);

const parseStoredUser = () => {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(parseStoredUser);

  // Refresh user flags from the server on mount so DB changes (e.g. canApprovePayments)
  // are picked up without requiring a re-login.
  useEffect(() => {
    if (!localStorage.getItem('accessToken')) return;
    getMe()
      .then(({ data }) => {
        const fresh = data.data;
        localStorage.setItem('user', JSON.stringify(fresh));
        setUser(fresh);
      })
      .catch(() => {});
  }, []);

  const login = useCallback(async (email, password) => {
    // 'app' gets a long rolling session on the server; browsers keep the 7-day one.
    const { data } = await loginApi({ email, password, client: isNative ? 'app' : 'web' });
    const { accessToken, refreshToken, user: userData } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(async () => {
    await unregisterPush(); // while still signed in, so the server accepts it
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
