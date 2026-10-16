/**
 * Two-letter initials for a payee: the first letters of the first two words, after dropping anything in brackets
 * and anything after a "·". A single word gives its first two letters.
 */
export function monogram(name: string): string {
  const base = (name.split('·')[0] ?? name).replace(/\([^)]*\)/g, ' ').trim();
  const words = base.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = (w: string): string => [...w].filter((c) => /\p{L}|\p{N}/u.test(c)).join('');
  const ws = words.map(letters).filter(Boolean);
  if (ws.length === 0) return '?';
  const out = ws.length === 1 ? [...ws[0]!].slice(0, 2).join('') : `${[...ws[0]!][0]}${[...ws[1]!][0]}`;
  return out.toUpperCase();
}
