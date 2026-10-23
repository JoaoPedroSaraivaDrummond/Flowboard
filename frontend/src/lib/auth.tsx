import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, setAuthToken, setUnauthorizedHandler } from './api';
import { queryKeys } from './query-keys';

const STORAGE_KEY = 'flowboard.token';

type AuthContextValue = {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode): the session just won't survive a reload.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => {
    const stored = readStoredToken();
    setAuthToken(stored);
    return stored;
  });

  const applyToken = useCallback((next: string | null) => {
    setAuthToken(next);
    writeStoredToken(next);
    setToken(next);
  }, []);

  const logout = useCallback(() => {
    applyToken(null);
    queryClient.clear();
  }, [applyToken, queryClient]);

  // Any 401 from the API (expired JWT, revoked user) ends the session.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Keep tabs in sync (login/logout in another tab).
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setAuthToken(event.newValue);
      setToken(event.newValue);
      if (!event.newValue) queryClient.clear();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await api.login(email, password);
      applyToken(response.token);
      queryClient.setQueryData(queryKeys.me, response.user);
    },
    [applyToken, queryClient],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const response = await api.register(name, email, password);
      applyToken(response.token);
      queryClient.setQueryData(queryKeys.me, response.user);
    },
    [applyToken, queryClient],
  );

  const value = useMemo(
    () => ({ token, login, register, logout }),
    [token, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export function useCurrentUser() {
  const { token } = useAuth();
  return useQuery({ queryKey: queryKeys.me, queryFn: api.me, enabled: token !== null });
}
