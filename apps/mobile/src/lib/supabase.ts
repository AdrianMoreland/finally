import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

const url = process.env['EXPO_PUBLIC_SUPABASE_URL'];
const key = process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY'];
if (!url || !key) throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set in the root .env');

/**
 * Keychain / Keystore entries are limited to about 2 KB; a Supabase session is larger, so it is split into
 * chunks. Keys may only contain [A-Za-z0-9._-].
 */
const CHUNK = 1800;
const safe = (k: string): string => k.replace(/[^A-Za-z0-9._-]/g, '_');

const secureStorage = {
  async getItem(name: string): Promise<string | null> {
    const k = safe(name);
    const count = await SecureStore.getItemAsync(`${k}.n`);
    if (count === null) return null;
    let out = '';
    for (let i = 0; i < Number(count); i++) out += (await SecureStore.getItemAsync(`${k}.${i}`)) ?? '';
    return out;
  },
  async setItem(name: string, value: string): Promise<void> {
    const k = safe(name);
    await secureStorage.removeItem(name);
    const parts = value.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? [''];
    await SecureStore.setItemAsync(`${k}.n`, String(parts.length));
    for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(`${k}.${i}`, parts[i]!);
  },
  async removeItem(name: string): Promise<void> {
    const k = safe(name);
    const count = await SecureStore.getItemAsync(`${k}.n`);
    if (count === null) return;
    for (let i = 0; i < Number(count); i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
    await SecureStore.deleteItemAsync(`${k}.n`);
  },
};

/** Supabase is used for authentication only. All data goes through the Finally API. */
export const supabase = createClient(url, key, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});
