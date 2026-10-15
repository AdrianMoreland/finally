import type { CategoryRef } from '@finally/contracts';
import { categoryColour } from '@finally/tokens';

const PARENT: Record<string, string> = {
  'public-transport': 'transport', taxi: 'transport', fuel: 'transport',
  health: 'other', travel: 'other', cash: 'other', fees: 'bills', bars: 'fun',
  household: 'shopping', gifts: 'shopping',
  income: 'groceries', transfers: 'other', savings: 'other',
};

/** Hex colour for a category in the current scheme; children share their parent's colour. */
export function categoryHex(c: Pick<CategoryRef, 'slug' | 'colour'> | null | undefined, scheme: 'light' | 'dark'): string {
  if (!c) return categoryColour('other', scheme);
  const slug = PARENT[c.slug] ?? c.slug;
  const known = categoryColour(slug, scheme);
  return known === categoryColour('other', scheme) && slug !== 'other' ? c.colour : known;
}
