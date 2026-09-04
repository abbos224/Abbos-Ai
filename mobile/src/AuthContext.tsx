import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import type { AuthUser } from './types';
import { clearToken, getToken, saveToken } from './authStorage';
import { getCurrentUser } from './api';

// 'pendingVerification': a real, logged-in session whose email hasn't been verified yet — gated
// to VerifyEmailScreen by App.tsx's AppShell, distinct from 'loggedOut' (no session at all).
type AuthStatus = 'loading' | 'loggedOut' | 'pendingVerification' | 'loggedIn';

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetches the current user and re-evaluates status — used by VerifyEmailScreen right after
   * a successful verify-email call, so the app flips to the main tabs without a full re-login. */
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function statusForUser(user: AuthUser): AuthStatus {
  return user.emailVerified ? 'loggedIn' : 'pendingVerification';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

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
        setStatus(statusForUser(current));
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
    setStatus(statusForUser(current));
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    setUser(null);
    setStatus('loggedOut');
  }, []);

  const refreshUser = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      setStatus('loggedOut');
      return;
    }
    const current = await getCurrentUser(token);
    setUser(current);
    setStatus(statusForUser(current));
  }, []);

  // The only deep link this app has: the tap-through link the server's Google OAuth callback
  // sends the user back to (see api.ts's googleSignInUrl / LoginScreen's handleGoogleSignIn) —
  // /oauth-callback?token=<jwt>. Handled here, not in a screen, so Google sign-in works no matter
  // which screen was showing when the browser tab closed. getInitialURL covers the (unlikely in
  // Expo Go's dev flow, but cheap to handle) case of the link arriving before this listener was
  // attached; the event listener covers the normal case of tapping it while already running.
  useEffect(() => {
    function handleUrl(url: string) {
      const { path, queryParams } = Linking.parse(url);
      if (path !== 'oauth-callback') return;
      const token = queryParams?.token;
      if (typeof token === 'string') signIn(token).catch(() => {});
    }

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, [signIn]);

  return <AuthContext.Provider value={{ status, user, signIn, signOut, refreshUser }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
