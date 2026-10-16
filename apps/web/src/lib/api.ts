import { FinallyApi } from '@finally/api-client';
import { supabase } from './supabase';

const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

export const api = new FinallyApi({
  baseUrl,
  getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  refreshToken: async () => (await supabase.auth.refreshSession()).data.session?.access_token ?? null,
  onUnauthorized: () => {
    void supabase.auth.signOut();
  },
});

export const API_URL = baseUrl;
