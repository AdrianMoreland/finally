import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { categoryColours, dark, extras, light, radius } from './index';

const figma = JSON.parse(readFileSync(new URL('../figma/tokens.json', import.meta.url), 'utf8')) as Record<
  string,
  { color?: Record<string, unknown>; shadow?: unknown; radius?: Record<string, unknown> }
>;

describe('figma tokens.json', () => {
  it('has every radius', () => {
    for (const k of Object.keys(radius)) expect(figma.core?.radius).toHaveProperty(k);
  });
  it.each([
    ['dark', dark],
    ['light', light],
  ] as const)('covers the %s palette, categories, toast and shadow', (mode, palette) => {
    const set = figma[mode];
    for (const k of Object.keys(palette)) expect(set?.color).toHaveProperty(k);
    const cats = (set?.color as Record<string, Record<string, unknown>>).category ?? {};
    for (const k of Object.keys(categoryColours)) expect(cats).toHaveProperty(k);
    expect(set?.color).toHaveProperty('toast');
    expect(set?.shadow).toBeDefined();
    expect(extras[mode].shadow).toBeTruthy();
  });
  it('includes travel and hair', () => {
    expect(categoryColours.travel.dark).toBe('#4CB7D9');
    expect(dark.hair).toMatch(/^rgba/);
  });
});
