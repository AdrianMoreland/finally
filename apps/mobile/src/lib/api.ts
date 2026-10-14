import { FinallyApi } from '@finally/api-client';
import Constants from 'expo-constants';
import { supabase } from './supabase';

/**
 * On a physical phone `localhost` is the phone itself. In development, fall back to the machine running Metro
 * (same IP, API port 3000) unless EXPO_PUBLIC_API_URL says otherwise.
 */
function resolveBaseUrl(): string {
  const configured = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';
  if (!/localhost|127\.0\.0\.1/.test(configured)) return configured;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? configured.replace(/localhost|127\.0\.0\.1/, host) : configured;
}

export const API_URL = resolveBaseUrl();

export const api = new FinallyApi({
  baseUrl: API_URL,
  getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  onUnauthorized: () => {
    void supabase.auth.signOut();
  },
});
