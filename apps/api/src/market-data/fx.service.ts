import { Injectable, Logger } from '@nestjs/common';
import { convertCurrency, D, m2 } from '@finally/finance-core';

/** Rough fallback if the ECB feed is unreachable (units of currency per 1 EUR). Clearly an estimate. */
const FALLBACK: Record<string, string> = {
  USD: '1.08', GBP: '0.85', CHF: '0.96', JPY: '163', AUD: '1.65', CAD: '1.47', SEK: '11.4', NOK: '11.6',
  DKK: '7.46', PLN: '4.3', CZK: '25', HUF: '395', RON: '4.97', BGN: '1.96', TRY: '35', NZD: '1.78', SGD: '1.45',
};

export interface EcbRates {
  asOf: Date;
  rates: Record<string, string>;
  source: 'ECB' | 'FALLBACK';
}

/** ECB euro reference rates (daily). Cached for six hours. */
@Injectable()
export class FxService {
  private readonly log = new Logger(FxService.name);
  private cache: { at: number; data: EcbRates } | null = null;

  async rates(): Promise<EcbRates> {
    if (this.cache && Date.now() - this.cache.at < 6 * 3_600_000) return this.cache.data;
    try {
      const res = await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const rates: Record<string, string> = {};
      for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) rates[m[1]!] = m[2]!;
      const day = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
      if (Object.keys(rates).length < 10) throw new Error('Unexpected ECB payload');
      const data: EcbRates = { asOf: new Date(`${day ?? new Date().toISOString().slice(0, 10)}T15:00:00Z`), rates, source: 'ECB' };
      this.cache = { at: Date.now(), data };
      return data;
    } catch (err) {
      this.log.warn(`ECB rates unavailable (${(err as Error).message}); using fallback table`);
      const data: EcbRates = { asOf: new Date(), rates: FALLBACK, source: 'FALLBACK' };
      this.cache = { at: Date.now() - 5 * 3_600_000, data }; // retry in about an hour
      return data;
    }
  }

  async convert(amount: string, from: string, to: string): Promise<{ rate: string; converted: string; asOf: Date; source: string }> {
    const { rates, asOf, source } = await this.rates();
    const r = convertCurrency(amount, from.toUpperCase(), to.toUpperCase(), rates);
    return { ...r, asOf, source: source === 'ECB' ? 'ECB euro reference rates' : 'Fallback estimate (ECB feed unreachable)' };
  }

  async toEur(amount: string, currency: string): Promise<string> {
    if (currency === 'EUR') return m2(amount);
    try {
      return (await this.convert(amount, currency, 'EUR')).converted;
    } catch {
      return m2(D(amount)); // unknown currency: keep the figure rather than lose the payment
    }
  }
}
