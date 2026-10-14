import { isQuietHours } from './quiet-hours';

// Europe/Dublin: GMT in January (UTC+0), IST in July (UTC+1)
const winter = (hhmm: string) => new Date(`2026-01-15T${hhmm}:00Z`);
const summer = (hhmmUtc: string) => new Date(`2026-07-15T${hhmmUtc}:00Z`);

describe('isQuietHours', () => {
  it('handles a window that crosses midnight', () => {
    expect(isQuietHours(winter('22:00'), '22:00', '08:00')).toBe(true);
    expect(isQuietHours(winter('03:30'), '22:00', '08:00')).toBe(true);
    expect(isQuietHours(winter('07:59'), '22:00', '08:00')).toBe(true);
    expect(isQuietHours(winter('08:00'), '22:00', '08:00')).toBe(false);
    expect(isQuietHours(winter('12:00'), '22:00', '08:00')).toBe(false);
    expect(isQuietHours(winter('21:59'), '22:00', '08:00')).toBe(false);
  });

  it('uses Dublin local time across daylight saving', () => {
    expect(isQuietHours(summer('21:30'), '22:00', '08:00')).toBe(true); // 22:30 IST
    expect(isQuietHours(summer('20:30'), '22:00', '08:00')).toBe(false); // 21:30 IST
    expect(isQuietHours(summer('06:30'), '22:00', '08:00')).toBe(true); // 07:30 IST
    expect(isQuietHours(summer('07:30'), '22:00', '08:00')).toBe(false); // 08:30 IST
  });

  it('handles same-day windows and the no-quiet-hours case', () => {
    expect(isQuietHours(winter('13:00'), '12:00', '14:00')).toBe(true);
    expect(isQuietHours(winter('15:00'), '12:00', '14:00')).toBe(false);
    expect(isQuietHours(winter('03:00'), '00:00', '00:00')).toBe(false);
  });
});
