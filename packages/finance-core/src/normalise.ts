export interface NormalisedMerchant {
  merchantKey: string;
  displayName: string;
}

/** Card scheme and acquirer prefixes that carry no merchant information. Matched at the start. */
const PREFIXES: RegExp[] = [
  /^(?:VDP|VDC|VDA|VD)\s*[-–]\s*/i,
  /^POS\s*[-:]?\s*(?=\S)/i,
  /^(?:CRV|TST|SQ|IZ|SP|PP|PAYPAL|SUMUP|ZETTLE|IZETTLE|STRIPE|GOOGLE|APPLE\.COM|AMZN\s*MKTP)\s*\*\s*/i,
  /^D\/D\s+/i,
  /^DD\s+(?=[A-Z])/i,
  /^DIRECT\s+DEBIT\s+/i,
  /^CARD\s+PAYMENT\s+(?:TO\s+)?/i,
  /^CONTACTLESS\s+/i,
];

/** Irish and common foreign locations that banks append to descriptors. Stripped from the end only. */
const LOCATIONS = new Set(
  [
    'DUBLIN', 'DUBLIN 1', 'DUBLIN 2', 'DUBLIN 4', 'DUBLIN 6', 'CORK', 'GALWAY', 'LIMERICK', 'WATERFORD',
    'KILKENNY', 'SLIGO', 'DROGHEDA', 'DUNDALK', 'ATHLONE', 'LETTERKENNY', 'TRALEE', 'ENNIS', 'NAAS',
    'SWORDS', 'BRAY', 'DUN LAOGHAIRE', 'DUNLAOGHAIRE', 'TALLAGHT', 'BLANCHARDSTOWN', 'RATHMINES',
    'RANELAGH', 'RATHGAR', 'RATHFARNHAM', 'DONNYBROOK', 'SANDYMOUNT', 'CLONDALKIN', 'LUCAN', 'MALAHIDE',
    'HOWTH', 'SANTRY', 'STILLORGAN', 'DUNDRUM', 'CABRA', 'PHIBSBORO', 'DRUMCONDRA', 'CLONTARF',
    'LONDON', 'BELFAST', 'AMSTERDAM', 'LUXEMBOURG', 'SINGAPORE', 'DUBLIN IRL', 'LONDON GBR',
    'IRELAND', 'IRL', 'IE', 'GBR', 'GB', 'UK', 'NLD', 'NL', 'LUX', 'LU', 'USA', 'US', 'DEU', 'DE', 'FR', 'ES',
  ].map((s) => s.toUpperCase()),
);

/** Generic trailing words with no identifying value. */
const GENERIC_TAIL = new Set([
  'STORES', 'STORE', 'LTD', 'LIMITED', 'PLC', 'DAC', 'CO', 'INC', 'LLC', 'WEB', 'ONLINE', 'PAYMENT',
  'PMT', 'REF', 'REFUND', 'SAL', 'SALARY', 'COM', 'WWW',
]);

/** Display names that title-casing gets wrong. Keyed by merchantKey. */
const DISPLAY_OVERRIDES: Record<string, string> = {
  'bewleys-grafton-st': "Bewley's Grafton St",
  bewleys: "Bewley's",
  mcdonalds: "McDonald's",
  'mc-donalds': "McDonald's",
  disneyplus: 'Disney+',
  'disney-plus': 'Disney+',
  'leap-top-up': 'Leap Card top-up',
  'leap-card': 'Leap Card',
  supervalu: 'SuperValu',
  'circle-k': 'Circle K',
  'dunnes-stores': 'Dunnes Stores',
  dunnes: 'Dunnes Stores',
  'just-eat': 'Just Eat',
  'bord-gais-energy': 'Bord Gáis Energy',
  'bord-gais': 'Bord Gáis Energy',
  'bord-gais-energy-ireland': 'Bord Gáis Energy',
  'virgin-media': 'Virgin Media',
  'irish-rail': 'Irish Rail',
  'dublin-bus': 'Dublin Bus',
  'electric-ireland': 'Electric Ireland',
  'free-now': 'FREE NOW',
  freenow: 'FREE NOW',
  'tesco-express': 'Tesco Express',
  'lidl-ireland': 'Lidl',
  'aldi-ireland': 'Aldi',
  'penneys': 'Penneys',
  'three-ireland': 'Three',
  'eir': 'Eir',
  'hbo-max': 'HBO Max',
  paypal: 'PayPal',
  youtube: 'YouTube',
  'youtube-premium': 'YouTube Premium',
  'apple-bill': 'Apple',
  'amazon-prime': 'Amazon Prime',
  'amznprime': 'Amazon Prime',
};

/** Month names that follow a payee on recurring payments ("RENT SEPT", "ACCOUNT FEE JUL"); dropped so each month is one merchant. */
const MONTH_TOKENS = new Set([
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'SEPT', 'OCT', 'NOV', 'DEC', 'JANUARY', 'FEBRUARY', 'MARCH',
  'APRIL', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]);

const SMALL_WORDS = new Set(['the', 'of', 'and', 'at', 'on', 'in', 'a', 'an', 'to', 'for']);

const isNoiseToken = (t: string): boolean => {
  if (/^\d+$/.test(t)) return true; // store / terminal numbers
  if (/^#\d+$/.test(t)) return true;
  if (/^\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?$/.test(t)) return true; // dates 12/10, 12-10-26
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return true;
  if (/^\d{1,2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/.test(t)) return true; // 12OCT
  if (/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{0,2}$/.test(t) && t.length > 3) return true; // OCT26
  // reference codes: 5+ chars mixing letters and digits, e.g. P2F9A1C, 2610071942
  if (t.length >= 5 && /\d/.test(t) && /[A-Z]/.test(t)) return true;
  if (t.length >= 6 && /^\d+$/.test(t)) return true;
  return false;
};

const stripAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function titleCase(words: string[]): string {
  return words
    .map((w, i) => {
      const lw = w.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lw)) return lw;
      if (lw === 'st' || lw === 'rd') return i > 0 ? (lw === 'st' ? 'St' : 'Rd') : lw.toUpperCase();
      if (w.length <= 3 && /^[A-Z0-9&]+$/.test(w) && /\d|&/.test(w)) return w; // e.g. "M&S"
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    })
    .join(' ');
}

/**
 * Turn a raw bank descriptor into a stable merchant key and a clean display name.
 * "VDP-TESCO STORES 3245 DUBLIN" → { merchantKey: "tesco", displayName: "Tesco" }
 */
export function normaliseMerchant(raw: string): NormalisedMerchant {
  let s = stripAccents(raw).replace(/\s+/g, ' ').trim();
  // Remove card/acquirer prefixes, possibly stacked ("VDP-PAYPAL *STEAM").
  for (let i = 0; i < 3; i++) {
    const before = s;
    for (const re of PREFIXES) s = s.replace(re, '');
    if (s === before) break;
  }
  s = s.toUpperCase();
  // Domain and path style descriptors: "BOLT.EU/O/2610071942", "NETFLIX.COM", "WWW.TESCO.IE"
  s = s.replace(/^(?:HTTPS?:\/\/)?(?:WWW\.)?/, '');
  s = s.replace(/\.(?:COM|IE|EU|CO\.UK|NET|ORG)(?:\/\S*)?/g, ' ');
  s = s.replace(/\//g, ' ');
  // Punctuation → spaces (keep & and apostrophes inside words)
  s = s.replace(/['’`]/g, '').replace(/[^A-Z0-9&+\s]/g, ' ').replace(/\s+/g, ' ').trim();

  let tokens = s.split(' ').filter(Boolean);
  const minKeep = 1;
  // Drop reference numbers, dates and codes anywhere.
  const withoutNoise = tokens.filter((t) => !isNoiseToken(t));
  if (withoutNoise.length >= minKeep) tokens = withoutNoise;

  // Strip trailing locations / country codes / generic words (repeatedly, never emptying the name).
  let changed = true;
  while (changed && tokens.length > minKeep) {
    changed = false;
    const last = tokens[tokens.length - 1]!;
    const lastTwo = tokens.length >= 3 ? `${tokens[tokens.length - 2]} ${last}` : '';
    if (lastTwo && LOCATIONS.has(lastTwo)) {
      tokens = tokens.slice(0, -2);
      changed = true;
    } else if (tokens.length > 1 && MONTH_TOKENS.has(last)) {
      tokens = tokens.slice(0, -1);
      changed = true;
    } else if (LOCATIONS.has(last) || GENERIC_TAIL.has(last)) {
      // Keep IRELAND when it is part of the name (Electric Ireland, Bank of Ireland).
      if (last === 'IRELAND' && ['ELECTRIC', 'OF'].includes(tokens[tokens.length - 2] ?? '')) break;
      tokens = tokens.slice(0, -1);
      changed = true;
    }
  }
  // Leading generic words ("THE" is kept: The Bernard Shaw)
  if (tokens.length === 0) tokens = ['UNKNOWN'];

  const merchantKey = tokens
    .join('-')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\+/g, '-plus')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';

  const displayName = DISPLAY_OVERRIDES[merchantKey] ?? titleCase(tokens);
  return { merchantKey, displayName };
}
