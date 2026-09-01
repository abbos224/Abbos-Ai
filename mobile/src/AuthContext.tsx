import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AuthUser } from './types';
import { clearToken, getToken, saveToken } from './authStorage';
import { getCurrentUser } from './api';

type AuthStatus = 'loading' | 'loggedIn' | 'loggedOut';

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  // Runs once on app launch: a stored token is only trusted once the server confirms it's still
  // valid — a rejected token is cleared here (SecureStore previously kept a stale/expired token
  // around indefinitely since nothing ever called clearToken() for it).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) {
        if (!cancelled) setStatus('loggedOut');
        return;
      }
      try {
        const current = await getCurrentUser(token);
        if (cancelled) return;
        setUser(current);
        setStatus('loggedIn');
      } catch {
        await clearToken();
        if (!cancelled) setStatus('loggedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (token: string) => {
    await saveToken(token);
    const current = await getCurrentUser(token);
    setUser(current);
    setStatus('loggedIn');
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    setUser(null);
    setStatus('loggedOut');
  }, []);

  return <AuthContext.Provider value={{ status, user, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
