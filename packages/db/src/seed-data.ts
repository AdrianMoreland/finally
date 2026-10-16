import type { AskGroup, CategoryGroup } from './generated/client.ts';

export interface SeedCategory {
  slug: string;
  name: string;
  group: CategoryGroup;
  askGroup: AskGroup;
  icon: string;
  colour: string;
  parent?: string;
}

/** Category colours follow packages/tokens; icons are lucide names. */
export const SEED_CATEGORIES: SeedCategory[] = [
  { slug: 'rent', name: 'Rent', group: 'ESSENTIALS', askGroup: 'OTHER', icon: 'house', colour: '#4B5B8F' },
  { slug: 'groceries', name: 'Groceries', group: 'ESSENTIALS', askGroup: 'FOOD', icon: 'shopping-basket', colour: '#2E9A6E' },
  { slug: 'eating-out', name: 'Eating out', group: 'LIFESTYLE', askGroup: 'FOOD', icon: 'utensils', colour: '#E0773E' },
  { slug: 'coffee', name: 'Coffee', group: 'LIFESTYLE', askGroup: 'FOOD', icon: 'coffee', colour: '#9A6A47' },
  { slug: 'transport', name: 'Transport', group: 'ESSENTIALS', askGroup: 'TRANSPORT', icon: 'bus', colour: '#3A78D8' },
  { slug: 'public-transport', name: 'Public transport', group: 'ESSENTIALS', askGroup: 'TRANSPORT', icon: 'train-front', colour: '#3A78D8', parent: 'transport' },
  { slug: 'taxi', name: 'Taxi', group: 'ESSENTIALS', askGroup: 'TRANSPORT', icon: 'car-taxi-front', colour: '#3A78D8', parent: 'transport' },
  { slug: 'fuel', name: 'Fuel', group: 'ESSENTIALS', askGroup: 'TRANSPORT', icon: 'fuel', colour: '#3A78D8', parent: 'transport' },
  { slug: 'bills', name: 'Bills', group: 'ESSENTIALS', askGroup: 'BILLS', icon: 'receipt', colour: '#7A62D6' },
  { slug: 'shopping', name: 'Shopping', group: 'LIFESTYLE', askGroup: 'SHOPPING', icon: 'shopping-bag', colour: '#D4508A' },
  { slug: 'subscriptions', name: 'Subscriptions', group: 'LIFESTYLE', askGroup: 'BILLS', icon: 'repeat', colour: '#1AA3A3' },
  { slug: 'fun', name: 'Fun', group: 'LIFESTYLE', askGroup: 'FUN', icon: 'party-popper', colour: '#B98A1C' },
  { slug: 'bars', name: 'Bars & pubs', group: 'LIFESTYLE', askGroup: 'FUN', icon: 'beer', colour: '#B98A1C', parent: 'fun' },
  { slug: 'other', name: 'Everything else', group: 'LIFESTYLE', askGroup: 'OTHER', icon: 'ellipsis', colour: '#8A9790' },
  { slug: 'health', name: 'Health', group: 'ESSENTIALS', askGroup: 'BILLS', icon: 'heart-pulse', colour: '#8A9790', parent: 'other' },
  { slug: 'travel', name: 'Travel', group: 'LIFESTYLE', askGroup: 'FUN', icon: 'plane', colour: '#4CB7D9' },
  { slug: 'cash', name: 'Cash', group: 'LIFESTYLE', askGroup: 'OTHER', icon: 'banknote', colour: '#8A9790', parent: 'other' },
  { slug: 'fees', name: 'Bank fees', group: 'ESSENTIALS', askGroup: 'BILLS', icon: 'landmark', colour: '#7A62D6', parent: 'bills' },
  { slug: 'gifts', name: 'Gifts', group: 'LIFESTYLE', askGroup: 'SHOPPING', icon: 'gift', colour: '#D4508A', parent: 'shopping' },
  { slug: 'household', name: 'Household', group: 'ESSENTIALS', askGroup: 'SHOPPING', icon: 'sofa', colour: '#D4508A', parent: 'shopping' },
  { slug: 'income', name: 'Income', group: 'INCOME', askGroup: 'OTHER', icon: 'banknote-arrow-down', colour: '#2E9A6E' },
  { slug: 'transfers', name: 'Transfers', group: 'TRANSFER', askGroup: 'OTHER', icon: 'arrow-left-right', colour: '#8A9790' },
  { slug: 'savings', name: 'Savings', group: 'SAVINGS', askGroup: 'OTHER', icon: 'piggy-bank', colour: '#13654F' },
];

/**
 * Irish merchant seed rules: category slug → merchant names. At seed time each name goes through
 * `normaliseMerchant` so the EXACT rule matches the key the sync pipeline produces.
 * Deliberately absent so the ask-me loop has something to ask about: Bewley's, Irish Rail, Steam.
 */
export const SEED_MERCHANTS: Record<string, string[]> = {
  groceries: [
    'Tesco', 'Tesco Express', 'Dunnes Stores', 'Lidl', 'Aldi', 'SuperValu', 'Centra', 'Spar', 'Eurospar',
    'Londis', 'Mace', 'Costcutter', 'Iceland', 'Fresh The Good Food Market', 'Joyces Supermarket',
    'Donnybrook Fair', 'Marks and Spencer Food', 'Supervalu Express',
  ],
  coffee: [
    '3FE Grand Canal', 'Starbucks', 'Costa Coffee', 'Insomnia', 'Butlers Chocolate Cafe', 'Two Boys Brew', '3FE', 'Tim Hortons',
    'Caffe Nero', 'Coffeeangel', 'Java Republic', 'Cafe Nero',
  ],
  'eating-out': [
    'Deliveroo', 'Just Eat', 'Uber Eats', 'McDonalds', 'Burger King', 'KFC', 'Supermacs', 'Subway', 'Dominos',
    'Papa Johns', 'Eddie Rockets', 'Nandos', 'Wagamama', 'Zambrero', 'Chopped', 'Boojum', 'Apache Pizza',
    'Four Star Pizza', 'Camile Thai', 'Five Guys', 'Pizza Hut', 'Taco Bell', 'Burrito and Co', 'Kimchi Hophouse',
    'Leo Burdock', 'Bunsen',
  ],
  'public-transport': [
    'Leap Card', 'Leap Top Up', 'Dublin Bus', 'Luas', 'Bus Eireann', 'Go Ahead Ireland', 'TFI', 'Dart', 'Aircoach',
    'Dublin Bikes', 'Irish Citylink',
  ],
  taxi: ['Bolt', 'FREE NOW', 'Uber', 'Lynk Taxi', 'Hailo', 'Gocar'],
  fuel: ['Circle K', 'Applegreen', 'Texaco', 'Topaz', 'Esso', 'Emo Oil', 'Amber Oil', 'Gulf'],
  transport: ['Q Park', 'eFlow', 'Parkmobile', 'Ringgo', 'M50 Toll'],
  bills: [
    'VHI Healthcare', 'Aviva Insurance', 'Electric Ireland', 'Bord Gais Energy', 'SSE Airtricity', 'Flogas', 'Pinergy', 'Energia', 'Eir', 'Vodafone',
    'Three', 'Virgin Media', 'Sky', 'Pure Telecom', 'Uisce Eireann', 'Irish Water', 'Aviva', 'Allianz', 'FBD Insurance',
    'AXA Insurance', 'Zurich Insurance', 'Irish Life', 'An Post', 'Dublin City Council', 'NCT', 'TV Licence',
    'Revenue', 'Yuno Energy', 'Prepay Power', 'Tesco Mobile',
  ],
  subscriptions: [
    'Netflix', 'Spotify', 'Disney Plus', 'Disneyplus', 'Amazon Prime', 'Apple', 'iCloud', 'Google One', 'YouTube Premium',
    'HBO Max', 'Paramount Plus', 'Audible', 'OpenAI', 'ChatGPT', 'Microsoft 365', 'Adobe', 'Dropbox', 'Notion',
    'Canva', 'Patreon', 'Strava', 'Xbox Game Pass', 'Playstation Plus', 'Nintendo Online', 'Duolingo', 'Headspace',
    'Tidal', 'Deezer', 'Github', 'Substack', 'Medium',
  ],
  shopping: [
    'Zara Grafton St', 'Penneys', 'Primark', 'Arnotts', 'Brown Thomas', 'Zara', 'H&M', 'Marks and Spencer', 'Next', 'River Island',
    'JD Sports', 'Sports Direct', 'Argos', 'Harvey Norman', 'DID Electrical', 'Currys', 'Amazon', 'eBay', 'Etsy',
    'ASOS', 'Shein', 'Decathlon', 'Smyths Toys', 'TK Maxx', 'Easons', 'Hodges Figgis', 'Dealz', 'Tiger',
  ],
  household: ['Woodies', 'Ikea', 'Homebase', 'B and Q'],
  health: [
    'Boots', 'McCabes Pharmacy', 'Hickeys Pharmacy', 'Lloyds Pharmacy', 'Life Pharmacy', 'Hamilton Long',
    'Specsavers', 'Vision Express', 'Flyefit', 'Ben Dunne Gyms', 'Gym Plus', 'Anytime Fitness', 'VHI', 'Laya Healthcare',
  ],
  fun: [
    'PlayStation Store', 'Xbox', 'Nintendo eShop', 'Odeon', 'Cineworld', 'Vue Cinemas', 'Light House Cinema',
    'Ticketmaster', 'Eventbrite', 'Paddy Power', 'Boylesports', 'Bowlplex', 'Dublin Zoo',
  ],
  travel: [
    'Ryanair', 'Aer Lingus', 'Booking.com', 'Airbnb', 'Hostelworld', 'Expedia', 'Skyscanner', 'Stena Line',
    'Irish Ferries', 'Trainline', 'Eurostar', 'Hotels.com',
  ],
  gifts: ['Interflora', 'Moonpig', 'Funky Pigeon', 'Prezzybox', 'Card Factory', 'Clintons'],
};

export interface SeedTaxRule {
  regime: 'EXIT_TAX' | 'CGT' | 'INVESTMENT_ACCOUNT';
  rate: string;
  annualExemption?: string;
  threshold?: string;
  contributionCap?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

/** Budget 2027 position as briefed. Update here (and in the table) when rates change. */
export const SEED_TAX_RULES: SeedTaxRule[] = [
  { regime: 'EXIT_TAX', rate: '0.4100', effectiveFrom: '2000-01-01', effectiveTo: '2025-12-31' },
  { regime: 'EXIT_TAX', rate: '0.3800', effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' },
  { regime: 'EXIT_TAX', rate: '0.3500', effectiveFrom: '2027-01-01' },
  { regime: 'CGT', rate: '0.3300', annualExemption: '1270.00', effectiveFrom: '2000-01-01', effectiveTo: '2026-10-06' },
  { regime: 'CGT', rate: '0.3100', annualExemption: '1270.00', effectiveFrom: '2026-10-07' },
  {
    regime: 'INVESTMENT_ACCOUNT',
    rate: '0.0100',
    threshold: '50000.00',
    contributionCap: '12000.00',
    effectiveFrom: '2027-07-01',
  },
];

export const DEMO_INSTRUMENTS = [
  { symbol: 'VWCE', isin: 'IE00BK5BQT80', exchange: 'Xetra', name: 'Vanguard FTSE All-World UCITS ETF (Acc)', assetClass: 'ETF', taxRegime: 'EXIT_TAX' },
  { symbol: 'EIMI', isin: 'IE00BKM4GZ66', exchange: 'Xetra', name: 'iShares Core MSCI EM IMI UCITS ETF', assetClass: 'ETF', taxRegime: 'EXIT_TAX' },
  { symbol: 'GOLD', isin: null, exchange: 'Spot', name: 'Gold bar, 20 g', assetClass: 'METAL', taxRegime: 'CGT' },
] as const;

export const DEMO_LOTS = [
  { symbol: 'VWCE', acquiredAt: '2024-03-12', quantity: '20', unitCost: '112.10' },
  { symbol: 'EIMI', acquiredAt: '2025-01-15', quantity: '60', unitCost: '29.40' },
  { symbol: 'VWCE', acquiredAt: '2025-06-03', quantity: '12', unitCost: '121.30' },
  { symbol: 'VWCE', acquiredAt: '2026-02-27', quantity: '10', unitCost: '127.20' },
  { symbol: 'GOLD', acquiredAt: '2024-09-10', quantity: '20', unitCost: '81.00' },
] as const;

export const DEMO_TARGET_ALLOCATION = { VWCE: 65, EIMI: 20, GOLD: 15 };


/**
 * Descriptor patterns that are not tied to one merchant name. Matched case-insensitively against the raw
 * bank descriptor with the lowest specificity, so any user rule or exact merchant rule wins first.
 */
export const SEED_PATTERN_RULES: Array<{ matchType: 'REGEX' | 'CONTAINS'; pattern: string; slug: string }> = [
  { matchType: 'REGEX', pattern: '\\b(landlord|rent)\\b', slug: 'rent' },
  { matchType: 'REGEX', pattern: '^account fee\\b', slug: 'fees' },
  { matchType: 'REGEX', pattern: '\\b(pharmacy|chemist)\\b', slug: 'health' },
  { matchType: 'REGEX', pattern: '\\b(insurance|assurance)\\b', slug: 'bills' },
  { matchType: 'REGEX', pattern: '\\b(cinema|cineworld|odeon)\\b', slug: 'fun' },
  { matchType: 'REGEX', pattern: '\\b(taxi|cab office)\\b', slug: 'taxi' },
  { matchType: 'REGEX', pattern: '\\b(petrol|diesel|fuel)\\b', slug: 'fuel' },
  { matchType: 'REGEX', pattern: '\\b(airlines?|airways|ryanair)\\b', slug: 'travel' },
];
