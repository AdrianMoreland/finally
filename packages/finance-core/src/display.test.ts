import { describe, expect, it } from 'vitest';
import { monogram } from './display';

describe('monogram', () => {
  it('uses the first letters of the first two words', () => {
    expect(monogram('Tesco Express')).toBe('TE');
    expect(monogram('Acme Ltd (Salary)')).toBe('AL');
  });
  it('ignores brackets and anything after a dot separator', () => {
    expect(monogram('Flatmate · rent share via Revolut')).toBe('FL');
    expect(monogram('(Pending) Nero')).toBe('NE');
  });
  it('single word gives two letters, empty gives a placeholder', () => {
    expect(monogram('apple')).toBe('AP');
    expect(monogram('   ')).toBe('?');
  });
});
