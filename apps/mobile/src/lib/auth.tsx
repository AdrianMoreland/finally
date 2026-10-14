import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  ready: boolean;
  email: string | null;
  sendMagicLink: (email: string) => Promise<{ error: string | null }>;
  /** Complete a magic-link deep link (PKCE code or implicit tokens). */
  completeFromUrl: (url: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      ready,
      email: session?.user.email ?? null,
      sendMagicLink: async (email) => {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: Linking.createURL('auth/callback') },
        });
        return { error: error?.message ?? null };
      },
      completeFromUrl: async (url) => {
        const parsed = Linking.parse(url);
        const code = typeof parsed.queryParams?.['code'] === 'string' ? parsed.queryParams['code'] : null;
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          return { error: error?.message ?? null };
        }
        const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
        const params = new URLSearchParams(hash);
        const access = params.get('access_token');
        const refresh = params.get('refresh_token');
        if (access && refresh) {
          const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
          return { error: error?.message ?? null };
        }
        return { error: 'That sign-in link is not valid any more. Request a new one.' };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, ready],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
