import { describe, expect, it } from 'vitest';
import { eur, eur0, shiftMonth, shortDate, dublinDay, monthLabel } from './format';

describe('format', () => {
  it('formats euro amounts with a real minus sign and optional plus', () => {
    expect(eur('-4.20')).toBe('−€4.20');
    expect(eur('3150')).toBe('€3,150.00');
    expect(eur('12.5', { signed: true })).toBe('+€12.50');
    expect(eur0('1099.6')).toBe('€1,100');
    expect(eur('nope')).toBe('—');
  });

  it('shows Dublin calendar dates for instants', () => {
    expect(dublinDay('2026-07-01T23:30:00Z')).toBe('2026-07-02');
    expect(shortDate('2026-10-14')).toBe('14 Oct');
    expect(shortDate('2026-01-15T23:30:00Z')).toBe('15 Jan');
  });

  it('shifts and labels months', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-11', 3)).toBe('2027-02');
    expect(monthLabel('2026-10')).toBe('October 2026');
  });
});
