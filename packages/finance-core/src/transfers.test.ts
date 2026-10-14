import { describe, expect, it } from 'vitest';
import { detectTransfers } from './transfers';

const tx = (id: string, accountId: string, date: string, amountEur: string) => ({ id, accountId, date, amountEur });

describe('detectTransfers', () => {
  it('pairs an AIB → Revolut top-up on the same day', () => {
    const pairs = detectTransfers(
      [tx('a', 'aib', '2026-10-07', '-300.00'), tx('b', 'rev', '2026-10-07', '300.00')],
      ['aib', 'rev'],
    );
    expect(pairs).toEqual([{ pairId: 'tp_a_b', outId: 'a', inId: 'b' }]);
  });

  it('pairs across a two-day settlement gap', () => {
    const pairs = detectTransfers(
      [tx('a', 'aib', '2026-10-07', '-300.00'), tx('b', 'rev', '2026-10-09', '300.00')],
      ['aib', 'rev'],
    );
    expect(pairs).toHaveLength(1);
  });

  it('does not pair beyond two days', () => {
    expect(
      detectTransfers(
        [tx('a', 'aib', '2026-10-07', '-300.00'), tx('b', 'rev', '2026-10-10', '300.00')],
        ['aib', 'rev'],
      ),
    ).toEqual([]);
  });

  it('ignores differing amounts and same-account movements', () => {
    expect(
      detectTransfers(
        [tx('a', 'aib', '2026-10-07', '-300.00'), tx('b', 'rev', '2026-10-07', '299.99'), tx('c', 'aib', '2026-10-07', '300.00')],
        ['aib', 'rev'],
      ),
    ).toEqual([]);
  });

  it('ignores accounts that are not the user\'s own', () => {
    expect(
      detectTransfers(
        [tx('a', 'aib', '2026-10-07', '-50.00'), tx('b', 'friend', '2026-10-07', '50.00')],
        ['aib', 'rev'],
      ),
    ).toEqual([]);
  });

  it('matches each transaction once, preferring the closest date', () => {
    const pairs = detectTransfers(
      [
        tx('o1', 'aib', '2026-10-07', '-100.00'),
        tx('i1', 'rev', '2026-10-09', '100.00'),
        tx('i2', 'rev', '2026-10-07', '100.00'),
      ],
      ['aib', 'rev'],
    );
    expect(pairs).toEqual([{ pairId: 'tp_o1_i2', outId: 'o1', inId: 'i2' }]);
  });
});
