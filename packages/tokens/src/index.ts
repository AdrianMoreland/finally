/**
 * Single source of truth for Finally design tokens.
 * `pnpm --filter @finally/tokens generate` turns this into:
 *   - css/theme.css                 (CSS variables + shadcn theme, used by apps/web)
 *   - preset/nativewind-preset.cjs  (Tailwind preset, used by apps/mobile)
 *   - src/native-themes.ts          (RGB channel vars for NativeWind light/dark themes)
 */

export const fonts = {
  display: { family: 'Bricolage Grotesque', weights: [600, 700] },
  body: { family: 'Hanken Grotesk', weights: [400, 500, 600] },
  mono: { family: 'IBM Plex Mono', weights: [400, 500] },
} as const;

export const fontStacks = {
  display: "'Bricolage Grotesque', 'Hanken Grotesk', system-ui, sans-serif",
  body: "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

export interface Palette {
  paper: string;
  surface: string;
  raised: string;
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  brand: string;
  brandInk: string;
  brandSoft: string;
  marker: string;
  markerInk: string;
  good: string;
  warn: string;
  bad: string;
  warnSoft: string;
  badSoft: string;
}

export const light: Palette = {
  paper: '#F1F4F2',
  surface: '#FFFFFF',
  raised: '#F7F9F8',
  ink: '#12201A',
  ink2: '#55655D',
  ink3: '#8A9790',
  rule: '#DCE3DF',
  brand: '#13654F',
  brandInk: '#FFFFFF',
  brandSoft: '#DCEFE7',
  marker: '#F4E35E',
  markerInk: '#3D3500',
  good: '#1F8A5B',
  warn: '#C7820E',
  bad: '#C23B2A',
  warnSoft: '#FBF0DA',
  badSoft: '#F8E3DF',
};

export const dark: Palette = {
  paper: '#0D1311',
  surface: '#141C19',
  raised: '#1A2420',
  ink: '#E6EEE9',
  ink2: '#9BAAA3',
  ink3: '#6B7A73',
  rule: '#25312C',
  brand: '#4CC69A',
  brandInk: '#0D1311',
  brandSoft: '#17362B',
  marker: '#E8D649',
  markerInk: '#2A2400',
  good: '#4CC69A',
  warn: '#E3A63A',
  bad: '#EF6A57',
  warnSoft: '#33281A',
  badSoft: '#3A1F1B',
};

/** Category colours by slug, light and dark variants. Unknown slugs use `other`. */
export const categoryColours = {
  rent: { light: '#4B5B8F', dark: '#7F8FC7' },
  groceries: { light: '#2E9A6E', dark: '#45B887' },
  'eating-out': { light: '#E0773E', dark: '#EE8F58' },
  coffee: { light: '#9A6A47', dark: '#C08B66' },
  transport: { light: '#3A78D8', dark: '#5C93EA' },
  bills: { light: '#7A62D6', dark: '#9B86EA' },
  shopping: { light: '#D4508A', dark: '#E56FA0' },
  subscriptions: { light: '#1AA3A3', dark: '#2FC0C0' },
  fun: { light: '#B98A1C', dark: '#D7AA3B' },
  other: { light: '#8A9790', dark: '#6B7A73' },
} as const;

export type CategoryColourSlug = keyof typeof categoryColours;

export function categoryColour(slug: string, mode: 'light' | 'dark' = 'light'): string {
  const entry = (categoryColours as Record<string, { light: string; dark: string }>)[slug];
  return (entry ?? categoryColours.other)[mode];
}

export const radius = { control: 6, card: 10, chip: 999 } as const;

/** 4-point spacing scale (px). */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const tokens = { fonts, fontStacks, light, dark, categoryColours, radius, spacing } as const;

export { nativeThemes } from './native-themes';
