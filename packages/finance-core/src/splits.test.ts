import { describe, expect, it } from 'vitest';
import { spent } from './ledger';
import { expandRentSplits, rentRounds, type RentConfig } from './rent';
import { applySplits, expandParts, splitProblems, type SplitPart } from './splits';
import { tx } from './testkit';

const part = (p: Partial<SplitPart> & Pick<SplitPart, 'amount'>): SplitPart => ({ kind: 'SPEND', categoryId: null, slug: null, parentSlug: null, ...p });
const RENT = { categoryId: 'c-rent', slug: 'rent', parentSlug: null };

describe('expandParts', () => {
  it('keeps each cash part as a row', () => {
    const { rows, changed } = expandParts('-45.00', [part({ amount: '-28.00', slug: 'tobacco' }), part({ amount: '-17.00', slug: 'groceries' })], RENT);
    expect(changed).toBe(false);
    expect(rows.map((r) => [r.key, r.amount, r.part.slug])).toEqual([
      ['p0', '-28.00', 'tobacco'],
      ['p1', '-17.00', 'groceries'],
    ]);
  });
  it('puts a changed bank amount into the largest part and says so', () => {
    const { rows, changed } = expandParts('-44.10', [part({ amount: '-28.00', slug: 'tobacco' }), part({ amount: '-17.00', slug: 'groceries' })], RENT);
    expect(changed).toBe(true);
    expect(rows.map((r) => r.amount)).toEqual(['-27.10', '-17.00']);
  });
  it('a non-cash part is spending plus the rent share it settles, net zero money', () => {
    const { rows } = expandParts('556.00', [part({ amount: '556.00', kind: 'SHARE', slug: 'rent', shareOf: 'a' }), part({ amount: '58.00', slug: 'electricity', shareOf: 'a', nonCash: true })], RENT);
    expect(rows.map((r) => [r.key, r.amount, r.part.kind, r.part.slug, r.part.shareOf])).toEqual([
      ['p0', '556.00', 'SHARE', 'rent', 'a'],
      ['n1', '-58.00', 'SPEND', 'electricity', 'a'],
      ['n1c', '58.00', 'SHARE', 'rent', 'a'],
    ]);
  });
});

describe('splitProblems', () => {
  const ok = [part({ amount: '-28.00' }), part({ amount: '-17.00' })];
  it('accepts parts that add up', () => expect(splitProblems('-45.00', ok)).toBeNull());
  it('rejects a sum that is off, by how much', () => expect(splitProblems('-45.00', [part({ amount: '-28.00' }), part({ amount: '-10.00' })])).toBe('The parts add up to €38.00 but the transaction is €45.00'));
  it('rejects a part on the wrong side of zero', () => expect(splitProblems('-45.00', [part({ amount: '-50.00' }), part({ amount: '5.00' })])).toBe('Every part must be money out, like the transaction'));
  it('needs a person on a non-cash part', () => expect(splitProblems('556.00', [part({ amount: '556.00' }), part({ amount: '58.00', nonCash: true })])).toBe('A part settled without money needs the person who covered it'));
  it('needs at least one part with money', () => expect(splitProblems('0.00', [])).toBe('Add at least one part'));
});

describe('applySplits', () => {
  const tesco = tx({ id: 't1', date: '2026-10-10', amount: '-45.00', slug: 'groceries', merchantKey: 'tesco' });
  it('replaces the row with its parts; the rest pass through', () => {
    const other = tx({ id: 'o1', date: '2026-10-11', amount: '-3.00', slug: 'coffee' });
    const rows = applySplits([tesco, other], { t1: [part({ amount: '-28.00', slug: 'tobacco', parentSlug: 'other' }), part({ amount: '-17.00', slug: 'groceries' })] }, RENT);
    expect(rows.map((r) => [r.id, r.amount, r.slug, r.splitOf ?? null])).toEqual([
      ['t1:p0', '-28.00', 'tobacco', 't1'],
      ['t1:p1', '-17.00', 'groceries', 't1'],
      ['o1', '-3.00', 'coffee', null],
    ]);
    expect(spent(rows, { slug: 'groceries' }).toFixed(2)).toBe('17.00');
    expect(spent(rows, { slug: 'other' }).toFixed(2)).toBe('28.00');
  });
  it('flags rows whose split had to follow a changed amount', () => {
    const rows = applySplits([{ ...tesco, amount: '-44.10' }], { t1: [part({ amount: '-28.00' }), part({ amount: '-17.00' })] }, RENT);
    expect(rows.every((r) => r.splitChanged === true)).toBe(true);
  });

  const cfg: RentConfig = {
    total: '2500',
    day: 8,
    household: 4,
    flatmates: [
      { id: 'v', name: 'Victor', matchers: ['victor'], amounts: [{ from: '2026-01', amount: '614' }] },
      { id: 'b', name: 'B', matchers: ['bram'], amounts: [{ from: '2026-01', amount: '614' }] },
      { id: 'c', name: 'C', matchers: ['cleo'], amounts: [{ from: '2026-01', amount: '766' }] },
    ],
    overdraftPatterns: [],
  };
  it("Victor's 556 plus the 58 electricity he deducted settles his whole 614 and costs you 58 of electricity", () => {
    const rent = tx({ id: 'r1', date: '2026-10-08', amount: '-2500.00', slug: 'rent', accountId: 'aib' });
    const victor = tx({ id: 'v1', date: '2026-10-10', amount: '556.00', kind: 'SHARE', slug: 'rent', rawDescriptor: 'VICTOR', accountId: 'aib', shareOf: 'v' });
    const rows = applySplits(
      [rent, victor],
      { v1: [part({ amount: '556.00', kind: 'SHARE', slug: 'rent', shareOf: 'v' }), part({ amount: '58.00', slug: 'electricity', shareOf: 'v', nonCash: true })] },
      RENT,
    );
    const [oct] = rentRounds(expandRentSplits(rows, cfg), cfg);
    expect(oct!.mates.find((m) => m.id === 'v')).toMatchObject({ due: '614.00', got: '614.00', left: '0.00' });
    expect(spent(rows, { slug: 'electricity' }).toFixed(2)).toBe('58.00');
    // the money that moved is unchanged: 556 in
    expect(rows.filter((r) => r.splitOf === 'v1').reduce((n, r) => n + Number(r.amount), 0)).toBe(556);
  });
});
