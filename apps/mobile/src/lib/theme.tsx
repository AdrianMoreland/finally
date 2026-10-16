import { nativeThemes } from '@finally/tokens';
import * as SecureStore from 'expo-secure-store';
import { vars } from 'nativewind';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';

export type ThemeMode = 'auto' | 'light' | 'dark';
const KEY = 'finally.theme';

interface ThemeCtx {
  mode: ThemeMode;
  scheme: 'light' | 'dark';
  setMode: (m: ThemeMode) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [mode, setModeState] = useState<ThemeMode>('auto');

  useEffect(() => {
    void SecureStore.getItemAsync(KEY).then((v) => {
      if (v === 'light' || v === 'dark') setModeState(v);
    });
  }, []);

  const value = useMemo<ThemeCtx>(
    () => ({
      mode,
      scheme: mode === 'auto' ? system : mode,
      setMode: (m) => {
        setModeState(m);
        void (m === 'auto' ? SecureStore.deleteItemAsync(KEY) : SecureStore.setItemAsync(KEY, m));
      },
    }),
    [mode, system],
  );

  // NativeWind reads the palette from CSS variables set on the root view.
  return (
    <Ctx.Provider value={value}>
      <View style={[{ flex: 1 }, vars(nativeThemes[value.scheme])]} className="bg-well">
        {children}
      </View>
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>');
  return v;
}

/** Raw hex for places that cannot use class names (chart libraries, tab bar). */
export function usePalette(): { paper: string; well: string; surface: string; ink: string; ink2: string; ink3: string; rule: string; brand: string; fill: string; onFill: string; marker: string; markerInk: string; pink: string } {
  const { scheme } = useTheme();
  const toHex = (rgb: string): string => `rgb(${rgb.split(' ').join(',')})`;
  const t = nativeThemes[scheme];
  return {
    paper: toHex(t['--m-paper']!),
    well: toHex(t['--m-well']!),
    surface: toHex(t['--m-surface']!),
    ink: toHex(t['--m-ink']!),
    ink2: toHex(t['--m-ink-2']!),
    ink3: toHex(t['--m-ink-3']!),
    rule: toHex(t['--m-rule']!),
    brand: toHex(t['--m-brand']!),
    fill: toHex(t['--m-fill']!),
    onFill: toHex(t['--m-on-fill']!),
    marker: toHex(t['--m-marker']!),
    markerInk: toHex(t['--m-marker-ink']!),
    pink: toHex(t['--m-pink']!),
  };
}

/** Turn a design variable name such as `--brand` or `--c-food` into the colour it has in the current scheme. */
export function useColourOf(): (cssVar: string) => string {
  const { scheme } = useTheme();
  const t = nativeThemes[scheme];
  return (name) => {
    const v = t[`--m-${name.replace(/^--/, '')}`] ?? t['--m-c-other']!;
    return `rgb(${v.split(' ').join(',')})`;
  };
}
