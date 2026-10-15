import { categoryColour } from '@finally/tokens';
import type { CategoryRef } from '@finally/contracts';

const KNOWN = new Set([
  'rent', 'groceries', 'eating-out', 'coffee', 'transport', 'bills', 'shopping', 'subscriptions', 'fun',
]);

/** Parent slug of the child categories that share their parent's colour in the design. */
const PARENT: Record<string, string> = {
  'public-transport': 'transport', taxi: 'transport', fuel: 'transport',
  health: 'other', travel: 'other', cash: 'other', fees: 'bills', bars: 'fun',
  household: 'shopping', gifts: 'shopping',
  income: 'groceries', transfers: 'other', savings: 'other',
};

/** CSS colour for a category: theme variable for the prototype's palette, else the stored hex. */
export function categoryVar(c: Pick<CategoryRef, 'slug' | 'colour'> | null | undefined): string {
  if (!c) return 'var(--c-other)';
  if (KNOWN.has(c.slug)) return `var(--c-${c.slug})`;
  const parent = PARENT[c.slug];
  if (parent) return `var(--c-${parent})`;
  return c.colour || categoryColour('other');
}
