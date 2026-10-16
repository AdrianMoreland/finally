import type { UserPrefs } from '@finally/contracts';
import type { RentConfig } from '@finally/finance-core';

/** The stored rent settings in the shape finance-core works on. Null when the feature is off (household below two). */
export function toRentConfig(prefs: Pick<UserPrefs, 'rent'>): RentConfig | null {
  const r = prefs.rent;
  if (r.household < 2) return null;
  return {
    total: r.total,
    day: r.day,
    household: r.household,
    flatmates: r.flatmates.map((f) => ({ id: f.id, name: f.name, matchers: f.matchers.map((m) => m.value), accountId: f.account ?? null })),
    overdraftPatterns: r.overdraftPatterns,
  };
}
