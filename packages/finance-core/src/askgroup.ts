import type { AskGroup } from '@finally/contracts';

export interface KnownMerchant {
  merchantKey: string;
  displayName: string;
  askGroup: AskGroup;
}

export interface AskGroupSuggestion {
  askGroup: AskGroup;
  source: 'KEYWORD' | 'SIMILAR' | 'NONE';
}

/** Keyword hints, checked in order, against the merchant key and raw descriptor. */
const HINTS: Array<[AskGroup, RegExp]> = [
  ['TRANSPORT', /\b(taxi|cab|uber|bolt|free-?now|rail|train|bus|luas|dart|leap|ferry|airline|ryanair|aer-?lingus|parking|toll|fuel|petrol|diesel|garage|applegreen|circle-?k|texaco|maxol|emo|esso|topaz)\b/],
  ['FOOD', /\b(cafe|caf|coffee|espresso|bakery|bagel|deli|restaurant|pizza|burger|sushi|kitchen|grill|bistro|eatery|noodle|ramen|curry|chipper|takeaway|brew|roast|bean|tea|bewleys?|kimchi|hophouse|brunch|food|foods|diner|tapas|bar-?and-?grill|supermarket|mart|grocer|spar|centra|londis)\b/],
  ['BILLS', /\b(insurance|energy|electric|gas|broadband|mobile|telecom|water|pharmacy|chemist|doctor|dental|dentist|clinic|optician|vhi|laya|hospital|rent|mortgage|council|revenue|nct|tv-?licen[cs]e|subscription|premium|membership|prime|plus|cloud|hosting)\b/],
  ['SHOPPING', /\b(shop|store|boutique|clothing|fashion|shoes|gift|amazon|ebay|etsy|zara|h-?and-?m|primark|penneys|argos|ikea|woodies|dealz|homestore|electronics|books|toys)\b/],
  ['FUN', /\b(pub|bar|inn|tavern|cinema|odeon|vue|game|games|gaming|steam[a-z]*|shaw|playstation|xbox|nintendo|bet|bookmaker|club|theatre|theater|ticket|ticketmaster|concert|festival|bowling|golf|arcade|museum|gym|fitness|sport|sports)\b/],
];

const tokens = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);

/**
 * Decide which quick-answer group to show for an unknown merchant: seed keyword hints first, then the most
 * similar merchant the user has already categorised (shared name tokens), otherwise OTHER.
 */
export function suggestAskGroup(
  merchantKey: string,
  rawDescriptor: string,
  known: readonly KnownMerchant[] = [],
): AskGroupSuggestion {
  const hay = `${merchantKey} ${rawDescriptor.toLowerCase()}`.replace(/[^a-z0-9\s-]/g, ' ');
  for (const [group, re] of HINTS) {
    if (re.test(hay)) return { askGroup: group, source: 'KEYWORD' };
  }
  const mine = new Set(tokens(merchantKey));
  let best: { score: number; group: AskGroup } | null = null;
  for (const k of known) {
    const overlap = tokens(k.merchantKey).filter((t) => mine.has(t)).length;
    if (overlap > 0 && (!best || overlap > best.score)) best = { score: overlap, group: k.askGroup };
  }
  if (best) return { askGroup: best.group, source: 'SIMILAR' };
  return { askGroup: 'OTHER', source: 'NONE' };
}
