import { describe, expect, it } from 'vitest';
import { moveCard, normaliseLayout, toggleHidden } from './layout';

const ids = ['kpis', 'hero', 'acts', 'pins'] as const;

describe('normaliseLayout', () => {
  it('gives the default order when nothing is stored', () => {
    expect(normaliseLayout(null, ids)).toEqual({ order: [...ids], hidden: {} });
    expect(normaliseLayout('junk', ids).order).toEqual([...ids]);
  });
  it('drops unknown and duplicate ids and appends missing ones', () => {
    const l = normaliseLayout({ order: ['acts', 'ghost', 'acts', 'kpis'], hidden: { ghost: true, kpis: true, hero: false } }, ids);
    expect(l.order).toEqual(['acts', 'kpis', 'hero', 'pins']);
    expect(l.hidden).toEqual({ kpis: true });
  });
  it('ignores malformed fields', () => {
    expect(normaliseLayout({ order: 5, hidden: [] }, ids)).toEqual({ order: [...ids], hidden: {} });
  });
});

describe('moveCard and toggleHidden', () => {
  const base = normaliseLayout(null, ids);
  it('moves a card and stops at the ends', () => {
    expect(moveCard(base, 'hero', -1).order).toEqual(['hero', 'kpis', 'acts', 'pins']);
    expect(moveCard(base, 'kpis', -1)).toBe(base);
    expect(moveCard(base, 'pins', 1)).toBe(base);
  });
  it('hides and shows', () => {
    const hidden = toggleHidden(base, 'acts');
    expect(hidden.hidden).toEqual({ acts: true });
    expect(toggleHidden(hidden, 'acts').hidden).toEqual({});
  });
});
