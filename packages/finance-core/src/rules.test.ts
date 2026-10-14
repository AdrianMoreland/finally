import { describe, expect, it } from 'vitest';
import { applyRules, type CoreRule } from './rules';

const rule = (o: Partial<CoreRule> & Pick<CoreRule, 'id' | 'pattern' | 'categoryId'>): CoreRule => ({
  matchType: 'EXACT',
  priority: 100,
  source: 'SEED',
  active: true,
  ...o,
});

const tx = { merchantKey: 'tesco', rawDescriptor: 'VDP-TESCO STORES 3245 DUBLIN' };

describe('applyRules', () => {
  it('matches EXACT on the merchant key', () => {
    expect(applyRules(tx, [rule({ id: '1', pattern: 'tesco', categoryId: 'groc' })])?.categoryId).toBe('groc');
  });

  it('EXACT does not match a substring of the key', () => {
    expect(applyRules(tx, [rule({ id: '1', pattern: 'tes', categoryId: 'groc' })])).toBeNull();
  });

  it('matches CONTAINS and REGEX on the raw descriptor, case-insensitively', () => {
    expect(
      applyRules(tx, [rule({ id: '1', matchType: 'CONTAINS', pattern: 'stores 32', categoryId: 'a' })])?.id,
    ).toBe('1');
    expect(
      applyRules(tx, [rule({ id: '2', matchType: 'REGEX', pattern: '^VDP-TESCO\\s+STORES', categoryId: 'b' })])?.id,
    ).toBe('2');
  });

  it('USER rules beat SEED rules regardless of priority', () => {
    const winner = applyRules(tx, [
      rule({ id: 'seed', pattern: 'tesco', categoryId: 'groc', priority: 999 }),
      rule({ id: 'user', pattern: 'tesco', categoryId: 'household', source: 'USER', priority: 1 }),
    ]);
    expect(winner?.id).toBe('user');
  });

  it('orders USER rules by priority, highest first', () => {
    const winner = applyRules(tx, [
      rule({ id: 'low', pattern: 'tesco', categoryId: 'a', source: 'USER', priority: 10 }),
      rule({ id: 'high', matchType: 'CONTAINS', pattern: 'tesco', categoryId: 'b', source: 'USER', priority: 90 }),
    ]);
    expect(winner?.id).toBe('high');
  });

  it('prefers the more specific match type on equal priority', () => {
    const winner = applyRules(tx, [
      rule({ id: 'contains', matchType: 'CONTAINS', pattern: 'tesco', categoryId: 'a' }),
      rule({ id: 'exact', pattern: 'tesco', categoryId: 'b' }),
    ]);
    expect(winner?.id).toBe('exact');
  });

  it('skips inactive rules and invalid regexes', () => {
    expect(
      applyRules(tx, [
        rule({ id: '1', pattern: 'tesco', categoryId: 'a', active: false }),
        rule({ id: '2', matchType: 'REGEX', pattern: '([', categoryId: 'b' }),
      ]),
    ).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(applyRules(tx, [])).toBeNull();
  });
});
