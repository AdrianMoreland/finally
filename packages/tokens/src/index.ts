/**
 * Single source of truth for Finally design tokens.
 * `pnpm --filter @finally/tokens generate` turns this into:
 *   - css/theme.css                 (CSS variables + shadcn theme, used by apps/web)
 *   - preset/nativewind-preset.cjs  (Tailwind preset, used by apps/mobile)
 *   - src/native-themes.ts          (RGB channel vars for NativeWind light/dark themes)
 */

export const fonts = {
  display: { family: 'Figtree', weights: [300, 400, 500, 600, 700] },
  body: { family: 'Figtree', weights: [300, 400, 500, 600, 700] },
  mono: { family: 'IBM Plex Mono', weights: [400, 500] },
} as const;

export const fontStacks = {
  display: "'Figtree', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  body: "'Figtree', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

/**
 * A synth rack: charcoal panels tiled on a black well with thin gutters. Mint marks what is active (`fill`, `brand`),
 * hot pink marks what needs you (`marker`, `pink`), and nothing about money going out is coloured as bad (`bad` is
 * the same amber as `warn`). Dark first, with a light "studio" variant.
 */
export interface Palette {
  paper: string;
  /** The gutters between panels. */
  well: string;
  surface: string;
  raised: string;
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  /** Text and strokes in the accent colour. */
  brand: string;
  /** Text on a solid `brand` background. */
  brandInk: string;
  brandSoft: string;
  /** Solid accent surfaces: primary buttons, the active nav item. */
  fill: string;
  /** Text on `fill`. */
  onFill: string;
  pink: string;
  pinkSoft: string;
  marker: string;
  markerInk: string;
  good: string;
  warn: string;
  bad: string;
  goodSoft: string;
  warnSoft: string;
  badSoft: string;
  /** Unfilled part of a slider or progress bar. */
  track: string;
  /** The tick on a bar: where an even pace would put you today. */
  needle: string;
}

export const dark: Palette = {
  paper: '#0B0B0C',
  well: '#050505',
  surface: '#1C1C1E',
  raised: '#262628',
  ink: '#E2E2E2',
  ink2: '#ABABB0',
  ink3: '#7A7A80',
  rule: '#343437',
  brand: '#9CFCEF',
  brandInk: '#0A1715',
  brandSoft: '#1A3431',
  fill: '#9CFCEF',
  onFill: '#0A1715',
  pink: '#FF6EAA',
  pinkSoft: '#3A1D2A',
  marker: '#FF6EAA',
  markerInk: '#240610',
  good: '#9CFCEF',
  warn: '#F2C46D',
  bad: '#F2C46D',
  goodSoft: '#1A3431',
  warnSoft: '#352B17',
  badSoft: '#352B17',
  track: '#3A3A3D',
  needle: '#C4C4C8',
};

export const light: Palette = {
  paper: '#DEDEDA',
  well: '#C6C6C1',
  surface: '#F6F6F3',
  raised: '#EAEAE6',
  rule: '#D2D2CC',
  ink: '#18181A',
  ink2: '#4F4F55',
  ink3: '#7A7A80',
  brand: '#087F72',
  brandInk: '#FFFFFF',
  brandSoft: '#D3F4EE',
  fill: '#8DEFE0',
  onFill: '#0A1715',
  pink: '#C8336F',
  pinkSoft: '#FBDDE9',
  marker: '#FF86B8',
  markerInk: '#2A0614',
  good: '#087F72',
  warn: '#9A6200',
  bad: '#9A6200',
  goodSoft: '#D3F4EE',
  warnSoft: '#F6E8C8',
  badSoft: '#F6E8C8',
  track: '#D0D0CA',
  needle: '#55555B',
};

/** Toasts and shadows differ by mode but are not part of the palette proper. */
export const extras = {
  dark: { toastBg: '#2E2E31', toastInk: '#EDEDED', toastAct: '#FF6EAA', shadow: '0 18px 50px rgba(0,0,0,.45)' },
  light: { toastBg: '#1C1C1E', toastInk: '#F2F2F2', toastAct: '#FF86B8', shadow: '0 14px 40px rgba(40,40,30,.16)' },
} as const;

/** Category colours by slug, light and dark variants. Unknown slugs use `other`. */
export const categoryColours = {
  rent: { light: '#8E8E94', dark: '#8A8A90' },
  groceries: { light: '#1BAF7A', dark: '#199E70' },
  'eating-out': { light: '#EB6834', dark: '#D95926' },
  coffee: { light: '#EDA100', dark: '#C98500' },
  transport: { light: '#2A78D6', dark: '#3987E5' },
  bills: { light: '#6250D6', dark: '#9085E9' },
  shopping: { light: '#E87BA4', dark: '#D55181' },
  subscriptions: { light: '#008300', dark: '#008300' },
  fun: { light: '#E34948', dark: '#E66767' },
  other: { light: '#A0A0A5', dark: '#6B6B70' },
} as const;

export type CategoryColourSlug = keyof typeof categoryColours;

export function categoryColour(slug: string, mode: 'light' | 'dark' = 'dark'): string {
  const entry = (categoryColours as Record<string, { light: string; dark: string }>)[slug];
  return (entry ?? categoryColours.other)[mode];
}

export const radius = { control: 3, card: 6, chip: 3 } as const;

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

export const tokens = { fonts, fontStacks, light, dark, extras, categoryColours, radius, spacing } as const;

export { nativeThemes } from './native-themes';
