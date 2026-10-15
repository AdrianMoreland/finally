import { Injectable } from '@nestjs/common';
import type { Db } from '@finally/db';
import type { BonusDto as BonusShape, CheckState, TaxDto as TaxShape } from '@finally/contracts';
import {
  addMonths,
  bonusCalc,
  bonusScenarios,
  D,
  expectedNet,
  IRISH_RULES,
  IRISH_RULES_VERSION,
  m2,
  median,
  PAYE_YEARS,
  payslipVerdict,
  previousRentCredit,
  spent,
  takeHome,
} from '@finally/finance-core';
import { InjectDb } from '../common/tokens';
import { LedgerService } from '../data/ledger.service';
import { SnapshotService, type Snapshot } from '../snapshot/snapshot.service';

type Item = { id: string; group: 'credits' | 'perks' | 'protection'; label: string; hint: (s: Snapshot, rentShare: number) => string; defaultState?: CheckState };

const marginalSaving = 0.2 + 0.03 + 0.0435;

const ITEMS: readonly Item[] = [
  { id: 'rent', group: 'credits', label: 'Rent Tax Credit 2026 · €1,000', hint: (_s, share) => `Your share, about €${Math.round(share).toLocaleString('en-IE')} a month, is enough for the full amount if your tenancy qualifies. €1,150 from 2027.` },
  { id: 'rentPrev', group: 'credits', label: 'Rent Tax Credit for earlier years', hint: () => 'For the years since your tenancy started.' },
  { id: 'medical', group: 'credits', label: 'Medical expenses at 20%', hint: () => 'Doctor, prescriptions, physio. Keep receipts with the payment in Transactions.' },
  { id: 'flat', group: 'credits', label: 'Flat-rate expenses for your job', hint: () => 'Set amounts that some professions can claim', defaultState: 'NA' },
  { id: 'taxsaver', group: 'perks', label: 'TaxSaver commuter ticket', hint: () => `A yearly Leap ticket paid from gross pay. On a €1,000 ticket you'd save about €${Math.round(1000 * marginalSaving)}.` },
  { id: 'cycle', group: 'perks', label: 'Cycle to Work', hint: () => 'A bike paid for from gross pay', defaultState: 'NA' },
  { id: 'sbe', group: 'perks', label: 'Small benefit exemption', hint: () => 'Up to five non-cash benefits worth €1,500 a year in total, tax-free' },
  { id: 'mff', group: 'perks', label: 'Pension: My Future Fund or a company scheme', hint: () => "Employer and State money you'd otherwise leave behind" },
  { id: 'income', group: 'protection', label: 'Income protection', hint: () => 'Pays part of your salary if illness stops you working' },
  { id: 'health', group: 'protection', label: 'Health insurance', hint: () => '20% tax relief is given at source' },
  { id: 'life', group: 'protection', label: 'Life cover', hint: () => 'Matters once someone depends on your income', defaultState: 'NA' },
  { id: 'file', group: 'protection', label: '"If something happens to me" file', hint: () => 'Encrypted list of accounts for one trusted person' },
];

@Injectable()
export class TaxService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly snapshot: SnapshotService,
    private readonly ledger: LedgerService,
  ) {}

  /** The user's own share of the rent, per month, from the last three months (rent spend net of housemates' shares). */
  rentShare(s: Snapshot): number {
    const last3 = [3, 2, 1].map((k) => addMonths(s.month, -k));
    return median(last3.map((m) => spent(s.txs, { slug: 'rent', from: `${m}-01`, to: `${m}-31` }))).toNumber();
  }

  async states(userId: string): Promise<Map<string, CheckState>> {
    const rows = await this.db.taxCheck.findMany({ where: { userId } });
    const m = new Map(ITEMS.map((i) => [i.id, i.defaultState ?? ('TODO' as CheckState)]));
    for (const r of rows) m.set(r.itemId, r.state);
    return m;
  }

  async setCheck(userId: string, itemId: string, state: CheckState): Promise<TaxShape> {
    if (ITEMS.some((i) => i.id === itemId)) {
      await this.db.taxCheck.upsert({ where: { userId_itemId: { userId, itemId } }, update: { state }, create: { userId, itemId, state } });
    }
    return this.get(userId);
  }

  async update(userId: string, patch: object): Promise<TaxShape> {
    await this.ledger.patchPrefs(userId, { tax: patch });
    return this.get(userId);
  }

  async get(userId: string, slipDate?: string): Promise<TaxShape> {
    const s = await this.snapshot.get(userId);
    const states = await this.states(userId);
    return this.build(s, states, slipDate);
  }

  build(s: Snapshot, states: Map<string, CheckState>, slipDate?: string): TaxShape {
    const t = s.prefs.tax;
    const th = takeHome(t.gross, t.year);
    const th2 = takeHome(t.gross + t.raise, t.year);
    const salaries = s.txs
      .filter((x) => x.kind === 'INCOME' && D(x.amount).gte(1000) && (!s.salary || x.rawDescriptor.replace(/\d+/g, '').replace(/\s+/g, ' ').trim().toUpperCase() === s.salary.family))
      .sort((a, b) => a.date.localeCompare(b.date));
    const payslips = salaries.map((x, i) => ({ date: x.date, label: `${new Date(`${x.date}T12:00:00Z`).toLocaleString('en-IE', { month: 'long', timeZone: 'UTC' })} ${x.date.slice(0, 4)}${i === 0 ? ' (first month)' : ''}`, net: m2(x.amount), first: i === 0 })).reverse();
    const chosen = payslips.find((p) => p.date === slipDate) ?? payslips[0] ?? null;
    const e = chosen ? expectedNet(t.gross, chosen.date) : null;
    const year = Number(s.today.slice(0, 4));
    const prev = previousRentCredit(t.tenancy, year);
    const rentThis = PAYE_YEARS[year]?.rentCredit ?? 1000;
    const unclaimed = (states.get('rent') === 'TODO' ? rentThis : 0) + (states.get('rentPrev') === 'TODO' ? prev : 0);
    const share = this.rentShare(s);
    return {
      inputs: t,
      takeHome: { gross: m2(t.gross), tax: m2(th.tax), usc: m2(th.usc), prsi: m2(th.prsi), net: m2(th.net), monthly: m2(th.net / 12) },
      takeHomeRaise: { gross: m2(t.gross + t.raise), net: m2(th2.net), monthly: m2(th2.net / 12), extraMonthly: m2((th2.net - th.net) / 12) },
      payslips,
      payslip:
        chosen && e
          ? {
              date: chosen.date,
              net: chosen.net,
              expected: { gross: m2(e.gross), tax: m2(e.tax), usc: m2(e.usc), prsi: m2(e.prsi), net: m2(e.net) },
              verdict: payslipVerdict({ net: Number(chosen.net), first: chosen.first, salary: t.gross, onDate: chosen.date, nextPayday: s.nextPay }),
            }
          : null,
      rentCredit: { thisYear: m2(rentThis), previous: m2(prev), sinceYear: t.tenancy ? t.tenancy.slice(0, 4) : null, monthlyRent: m2(share) },
      unclaimed: m2(unclaimed),
      items: ITEMS.map((i) => ({
        id: i.id,
        group: i.group,
        label: i.id === 'rentPrev' ? `Rent Tax Credit for earlier years · ${prev ? `€${prev.toLocaleString('en-IE')}` : 'none'}` : i.label,
        hint:
          i.id === 'rentPrev'
            ? prev
              ? `For the years since your tenancy started in ${t.tenancy?.slice(0, 4)}.`
              : 'Your tenancy started this year, so there are no earlier years.'
            : i.hint(s, share),
        state: states.get(i.id) ?? 'TODO',
      })),
      rules: {
        version: IRISH_RULES_VERSION,
        reviewed: IRISH_RULES.reduce((a, r) => (r.reviewed > a ? r.reviewed : a), '0000-00-00'),
        rows: IRISH_RULES.map((r) => ({ ...r })),
      },
    };
  }

  /* ------------------------------------------------------------------ bonus */

  async bonus(userId: string): Promise<BonusShape> {
    const s = await this.snapshot.get(userId);
    return this.buildBonus(s);
  }

  buildBonus(s: Snapshot): BonusShape {
    const b = s.prefs.bonus;
    const salary = s.prefs.tax.gross;
    const c = bonusCalc({ salary, target: b.target, pct: b.pct, year: b.year, pension: b.pension });
    const allocated = Object.values(b.allocation).reduce((a, v) => a + v, 0);
    return {
      inputs: b,
      salary,
      gross: m2(c.gross),
      cap: m2(c.cap),
      pension: m2(c.pension),
      taxWithout: m2(c.taxWithout),
      taxWith: m2(c.taxWith),
      usc: m2(c.usc),
      prsi: m2(c.prsi),
      netWithoutPension: m2(c.netWithoutPension),
      netWithPension: m2(c.netWithPension),
      aboveBand: m2(c.aboveBand),
      scenarios: bonusScenarios(salary, b.target, b.year).map((x) => ({ pct: x.pct, net: m2(x.net) })),
      unallocated: m2(c.netWithPension - allocated),
    };
  }

  async updateBonus(userId: string, patch: object): Promise<BonusShape> {
    await this.ledger.patchPrefs(userId, { bonus: patch });
    return this.bonus(userId);
  }
}
