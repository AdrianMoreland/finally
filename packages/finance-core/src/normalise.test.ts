import { describe, expect, it } from 'vitest';
import { normaliseMerchant } from './normalise';

const cases: Array<[string, string, string]> = [
  ['VDP-TESCO STORES 3245 DUBLIN', 'tesco', 'Tesco'],
  ['SQ *THE BERNARD SHAW', 'the-bernard-shaw', 'The Bernard Shaw'],
  ['VDP-TESCO STORES 3112', 'tesco', 'Tesco'],
  ['VDP-LIDL RATHMINES', 'lidl', 'Lidl'],
  ['VDP-SUPERVALU RANELAGH', 'supervalu', 'SuperValu'],
  ['VDC-BEWLEYS GRAFTON ST', 'bewleys-grafton-st', "Bewley's Grafton St"],
  ['PAYPAL *STEAMGAMES', 'steamgames', 'Steamgames'],
  ['SUMUP *PHOENIX PARK CAFE', 'phoenix-park-cafe', 'Phoenix Park Cafe'],
  ['IRISH RAIL WEB 4471', 'irish-rail', 'Irish Rail'],
  ['LEAP TOP UP 0023481', 'leap-top-up', 'Leap Card top-up'],
  ['D/D ELECTRIC IRELAND', 'electric-ireland', 'Electric Ireland'],
  ['D/D THREE IRELAND', 'three', 'Three'],
  ['SPOTIFY P2F9A1C', 'spotify', 'Spotify'],
  ['NETFLIX.COM', 'netflix', 'Netflix'],
  ['DISNEYPLUS.COM', 'disneyplus', 'Disney+'],
  ['BOLT.EU/O/2610071942', 'bolt', 'Bolt'],
  ['DELIVEROO IE', 'deliveroo', 'Deliveroo'],
  ['VDP-DUNNES STORES CORK', 'dunnes', 'Dunnes Stores'],
  ['POS ALDI IRELAND 0231', 'aldi', 'Aldi'],
  ['CRV*TWO BOYS BREW', 'two-boys-brew', 'Two Boys Brew'],
  ['VDC-CIRCLE K BALLSBRIDGE 1123', 'circle-k-ballsbridge', 'Circle K Ballsbridge'],
  ['VDP-APPLEGREENS N11 DUBLIN', 'applegreens-n11', 'Applegreens N11'],
  ['SQ *KIMCHI HOPHOUSE', 'kimchi-hophouse', 'Kimchi Hophouse'],
  ['VDP-ARNOTTS LTD', 'arnotts', 'Arnotts'],
  ['VDP-PENNEYS DUBLIN 1', 'penneys', 'Penneys'],
  ['VDC-BOOTS PHARMACY 4452 DUBLIN IE', 'boots-pharmacy', 'Boots Pharmacy'],
  ['VIRGIN MEDIA IRELAND LIMITED', 'virgin-media', 'Virgin Media'],
  ['VDP-MCDONALDS 1182 GALWAY', 'mcdonalds', "McDonald's"],
  ['AMAZON.CO.UK*2K4LP7T', 'amazon', 'Amazon'],
  ['WWW.JUSTEAT.IE', 'justeat', 'Justeat'],
  ['VDA-LUAS TVM 12/10', 'luas-tvm', 'Luas Tvm'],
  ['vdp-tesco stores 3245 dublin', 'tesco', 'Tesco'],
  ['  VDP-TESCO   STORES   3245  ', 'tesco', 'Tesco'],
  ['VDP-CAFÉ EN SEINE 12OCT DUBLIN', 'cafe-en-seine', 'Cafe En Seine'],
  ['VDP-M&S GRAFTON ST', 'mands-grafton-st', 'M&S Grafton St'],
  ['GOOGLE *YOUTUBE PREMIUM', 'youtube-premium', 'YouTube Premium'],
  ['SO LANDLORD OCT RENT', 'so-landlord-oct-rent', 'So Landlord Oct Rent'],
  ['', 'unknown', 'Unknown'],
];

describe('normaliseMerchant', () => {
  it.each(cases)('%s', (raw, key, name) => {
    expect(normaliseMerchant(raw)).toEqual({ merchantKey: key, displayName: name });
  });

  it('is idempotent on its own display name', () => {
    const first = normaliseMerchant('VDP-TESCO STORES 3245 DUBLIN');
    expect(normaliseMerchant(first.displayName).merchantKey).toBe(first.merchantKey);
  });

  it('gives the same key for different store numbers of one chain', () => {
    expect(normaliseMerchant('VDP-TESCO STORES 3245').merchantKey).toBe(
      normaliseMerchant('VDP-TESCO STORES 9001 CORK').merchantKey,
    );
  });
});
