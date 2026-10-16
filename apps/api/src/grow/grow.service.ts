import { BadRequestException, Injectable } from '@nestjs/common';
import type { FreedomDto as FreedomShape, InvestingPlanDto as InvestingShape, PaperDto as PaperShape, VaultDto as VaultShape } from '@finally/contracts';
import {
  advanceMoves,
  BUYBACK_DISCOUNT,
  D,
  freedomMilestones,
  freedomSim,
  yearTable,
  GOLD_PER_OZ,
  GUARD_DROP,
  m2,
  METAL_PRODUCTS,
  myFutureFund,
  paydaysUntil,
  practiceLabel,
  practicePrice,
  PRACTICE_INSTRUMENTS,
  PRACTICE_START,
  SILVER_PER_OZ,
  spotPerGram,
  sum,
  wrapperSim,
  eur0,
  type Decimal,
} from '@finally/finance-core';
import { LedgerService } from '../data/ledger.service';
import { PotsService } from '../pots/pots.service';
import { SnapshotService, type Snapshot } from '../snapshot/snapshot.service';
import { TaxService } from '../tax/tax.service';

const IA_OPENS = '2027-07-01';
const IA_CAP = 12000;
const MIX_NAMES: Record<string, string> = { world: 'World stocks', sp: 'S&P 500', em: 'Emerging markets', gold: 'Gold', cash: 'Cash' };

@Injectable()
export class GrowService {
  constructor(
    private readonly snapshot: SnapshotService,
    private readonly ledger: LedgerService,
    private readonly pots: PotsService,
    private readonly tax: TaxService,
  ) {}

  /* --------------------------------------------------------------- investing */

  async investing(userId: string): Promise<InvestingShape> {
    return this.buildInvesting(await this.snapshot.get(userId), userId);
  }

  private async buildInvesting(s: Snapshot, userId: string): Promise<InvestingShape> {
    const ladder = this.pots.ladder(s);
    const rung = (k: string) => ladder.rungs.find((r) => r.key === k)!;
    const rainy = s.pots.find((p) => p.type === 'SAFETY');
    const rainyBal = rainy ? D(this.snapshot.potBalance(rainy)) : D(0);
    const mff = (await this.tax.states(userId)).get('mff') ?? 'TODO';
    const inv = s.prefs.investing;
    const readiness = [
      { id: 'plan', title: 'Paying-back plan running', ok: rung('plan').done, partial: false, sub: rung('plan').when, checkable: false },
      { id: 'starter', title: '€1,000 starter fund', ok: rung('starter').done, partial: rainyBal.gt(0), sub: `${eur0(rainyBal.toFixed(2))} of €1,000 · ${rung('starter').when}`, checkable: false },
      { id: 'three', title: 'Rainy day at 3 months', ok: rung('three').done, partial: rainyBal.gt(0), sub: `${eur0(rainyBal.toFixed(2))} of ${eur0(s.essentials.times(3).toFixed(2))} · ${rung('three').when}`, checkable: false },
      { id: 'mff', title: 'Pension top-ups checked', ok: mff !== 'TODO', partial: false, sub: "If you have no workplace pension, My Future Fund adds your employer's 1.5% and the State's 0.5% to your 1.5%", checkable: true },
      { id: 'rules', title: 'Your investing rules saved', ok: inv.rulesSaved, partial: false, sub: 'Write them below once; every buy and sell is checked against them', checkable: false },
    ];
    const investPot = s.pots.find((p) => p.type === 'INVESTING');
    const daysToOpen = Math.round((Date.parse(`${IA_OPENS}T00:00:00Z`) - Date.parse(`${s.today}T00:00:00Z`)) / 86_400_000);
    const potAtOpen = (investPot ? D(this.snapshot.potBalance(investPot)) : D(0)).plus(D(investPot?.monthly.toString() ?? 0).times(paydaysUntil(s.today, s.user.paydayDayOfMonth, IA_OPENS, true)));

    const paper = this.paperValues(s);
    const mixTotal = Object.values(inv.mix).reduce((a, v) => a + v, 0) || 1;
    const actual: Record<string, number> = { world: 0, sp: 0, em: 0, gold: 0, cash: paper.cash };
    for (const h of paper.holdings) actual[h.mix] = (actual[h.mix] ?? 0) + h.value;
    const total = paper.cash + paper.holdings.reduce((a, h) => a + h.value, 0);
    const drift = Object.keys(inv.mix).map((key) => {
      const target = (inv.mix[key]! / mixTotal) * 100;
      const act = total ? ((actual[key] ?? 0) / total) * 100 : 0;
      return { key, label: MIX_NAMES[key] ?? key, target, actual: act, diff: act - target };
    });
    const under = drift.filter((d) => d.key !== 'cash').sort((a, b) => a.diff - b.diff)[0];
    const w = inv.wrapper;
    const sim = wrapperSim(w.monthly, w.years, w.returnPct / 100, w.terPct, w.fxPct);
    return {
      readiness,
      readyCount: readiness.filter((r) => r.ok).length,
      investAccount: { opens: IA_OPENS, daysToOpen, potAtOpen: m2(potAtOpen), bonusAllocation: m2(s.prefs.bonus.allocation.invest), cap: m2(IA_CAP) },
      prefs: inv,
      monthlyInvest: m2(investPot?.monthly.toString() ?? 0),
      drift,
      nextGoesTo: paper.holdings.length && under ? under.label : null,
      hasPositions: paper.holdings.length > 0,
      wrapper: { paid: m2(sim.paid), pre: m2(sim.pre), fees: m2(sim.fees), etf: m2(sim.etf), ia: m2(sim.ia), shares: m2(sim.shares), capped: sim.capped },
    };
  }

  async updateInvesting(userId: string, patch: object): Promise<InvestingShape> {
    await this.ledger.patchPrefs(userId, { investing: patch });
    return this.investing(userId);
  }

  /* ----------------------------------------------------------------- freedom */

  async freedom(userId: string): Promise<FreedomShape> {
    const s = await this.snapshot.get(userId);
    return this.buildFreedom(s);
  }

  private buildFreedom(s: Snapshot): FreedomShape {
    const f = s.prefs.freedom;
    const r = freedomSim(f);
    return {
      inputs: f,
      target: m2(r.target),
      years: r.years,
      p10: r.p10.map((v) => Math.round(v)),
      p50: r.p50.map((v) => Math.round(v)),
      p90: r.p90.map((v) => Math.round(v)),
      hitAge: r.hitYear >= 0 ? f.age + r.hitYear : null,
      probBy55: r.probBy55,
      myFutureFund: m2(myFutureFund(s.prefs.tax.gross, f.age)),
      ladder: this.pots.ladder(s),
      milestones: freedomMilestones({ today: s.today, ...this.pots.milestoneDates(s), hitYear: r.hitYear }),
      table: (() => {
        const t = yearTable(r, { startYear: Number(s.today.slice(0, 4)), age: f.age, monthly: f.monthly, raisePct: f.raisePct });
        return { years: t.years, age: t.age, p50: t.p50.map(Math.round), p10: t.p10.map(Math.round), p90: t.p90.map(Math.round), put: t.put.map(Math.round), share: t.share, enough: t.enough };
      })(),
      gross: s.prefs.tax.gross,
    };
  }

  async updateFreedom(userId: string, patch: object): Promise<FreedomShape> {
    await this.ledger.patchPrefs(userId, { freedom: patch });
    return this.freedom(userId);
  }

  /* ---------------------------------------------------------- practice account */

  private paperValues(s: Snapshot) {
    const p = s.prefs.paper;
    const holdings = Object.entries(p.positions)
      .filter(([, pos]) => pos.qty > 0.0001)
      .map(([symbol, pos]) => {
        const inst = PRACTICE_INSTRUMENTS.find((i) => i.symbol === symbol)!;
        const value = pos.qty * practicePrice(inst.price, p.moves[symbol]);
        return { symbol, name: inst.name, qty: pos.qty, value, cost: pos.cost, mix: inst.mix };
      });
    return { cash: p.cash, holdings };
  }

  async paper(userId: string): Promise<PaperShape> {
    return this.buildPaper(await this.snapshot.get(userId));
  }

  private buildPaper(s: Snapshot): PaperShape {
    const p = s.prefs.paper;
    const { cash, holdings } = this.paperValues(s);
    const total = cash + holdings.reduce((a, h) => a + h.value, 0);
    const guardHolding = p.guard ? holdings.find((h) => h.symbol === p.guard) : null;
    return {
      cash: m2(cash),
      step: p.step,
      holdings: holdings.map((h) => ({ symbol: h.symbol, name: h.name, qty: h.qty, value: m2(h.value), cost: m2(h.cost), gain: m2(h.value - h.cost), gainPct: h.cost ? ((h.value - h.cost) / h.cost) * 100 : 0 })),
      total: m2(total),
      start: m2(PRACTICE_START),
      guard: guardHolding ? { symbol: guardHolding.symbol, downPct: (1 - guardHolding.value / guardHolding.cost) * 100 } : null,
      log: p.log.slice(0, 6),
      signals: PRACTICE_INSTRUMENTS.map((i) => {
        const mv = p.moves[i.symbol] ?? 1;
        return { symbol: i.symbol, price: m2(practicePrice(i.price, mv)), changePct: (mv - 1) * 100, ...practiceLabel(mv) };
      }),
      instruments: PRACTICE_INSTRUMENTS.map((i) => ({ symbol: i.symbol, name: i.name })),
    };
  }

  async trade(userId: string, body: { action: 'buy' | 'sell' | 'advance' | 'guard-keep' | 'guard-sell'; symbol?: string; amount?: string }): Promise<PaperShape> {
    const s = await this.snapshot.get(userId);
    const p = structuredClone(s.prefs.paper);
    const inst = PRACTICE_INSTRUMENTS.find((i) => i.symbol === body.symbol);
    const log = (line: string): void => void p.log.unshift(line);
    const price = (sym: string): number => practicePrice(PRACTICE_INSTRUMENTS.find((i) => i.symbol === sym)!.price, p.moves[sym]);

    if (body.action === 'buy') {
      if (!inst) throw new BadRequestException('Pick something to buy');
      const amt = Number(body.amount ?? 0);
      if (!(amt >= 10)) throw new BadRequestException('Practice buys start at €10');
      if (amt > p.cash + 0.005) throw new BadRequestException('Not enough practice cash');
      const qty = amt / price(inst.symbol);
      const cur = p.positions[inst.symbol] ?? { qty: 0, cost: 0 };
      p.positions[inst.symbol] = { qty: cur.qty + qty, cost: cur.cost + amt };
      p.cash -= amt;
      log(`Bought €${amt.toFixed(0)} of ${inst.symbol}`);
    } else if (body.action === 'sell' || body.action === 'guard-sell') {
      const sym = body.symbol ?? p.guard;
      const pos = sym ? p.positions[sym] : null;
      if (!sym || !pos || pos.qty <= 0) throw new BadRequestException('Nothing to sell');
      if (body.action === 'sell' && p.guard === sym) throw new BadRequestException(`Your rule says wait 7 days after a 10% fall. Keep ${sym}, or sell anyway.`);
      const value = pos.qty * price(sym);
      p.cash += value;
      delete p.positions[sym];
      if (p.guard === sym) p.guard = null;
      log(`Sold ${sym} for €${value.toFixed(0)} (${value >= pos.cost ? '+' : '−'}€${Math.abs(value - pos.cost).toFixed(0)})`);
    } else if (body.action === 'guard-keep') {
      if (p.guard) log(`Kept ${p.guard} through the fall, as your rule says`);
      p.guard = null;
    } else {
      p.step += 1;
      p.moves = advanceMoves(p.moves, p.step);
      const hit = Object.entries(p.positions).find(([sym, pos]) => pos.qty > 0 && pos.qty * price(sym) < pos.cost * (1 - GUARD_DROP));
      if (hit && s.prefs.investing.rules.wait) {
        p.guard = hit[0];
        log(`Month ${p.step}: ${hit[0]} fell more than 10%`);
      } else log(`Month ${p.step} passed`);
    }
    p.log = p.log.slice(0, 12);
    await this.ledger.setSection(userId, 'paper', p);
    return this.paper(userId);
  }

  /* ------------------------------------------------------------------- vault */

  async vault(userId: string): Promise<VaultShape> {
    return this.buildVault(await this.snapshot.get(userId));
  }

  private buildVault(s: Snapshot): VaultShape {
    const items = s.prefs.vault.map((v, index) => {
      const p = METAL_PRODUCTS.find((x) => x.key === v.product)!;
      const spot = v.qty * p.grams * spotPerGram(p.metal);
      return { index, product: v.product, name: p.name, qty: v.qty, paid: m2(v.paid), spot: m2(spot), buyback: m2(spot * (1 - BUYBACK_DISCOUNT)), premiumPct: p.premium * 100 };
    });
    const buyback: Decimal = sum(items.map((i) => i.buyback));
    return {
      items,
      products: METAL_PRODUCTS.map((p) => ({ key: p.key, name: p.name })),
      buybackTotal: m2(buyback),
      paidTotal: m2(sum(items.map((i) => i.paid))),
      goldSpot: m2(GOLD_PER_OZ),
      silverSpot: m2(SILVER_PER_OZ),
    };
  }

  async addVault(userId: string, product: string, qty: number): Promise<VaultShape> {
    const p = METAL_PRODUCTS.find((x) => x.key === product);
    if (!p) throw new BadRequestException('Unknown product');
    const s = await this.snapshot.get(userId);
    const paid = qty * p.grams * spotPerGram(p.metal) * (1 + p.premium);
    await this.ledger.setSection(userId, 'vault', [...s.prefs.vault, { product, qty, paid: Math.round(paid * 100) / 100 }]);
    return this.vault(userId);
  }

  async removeVault(userId: string, index: number): Promise<VaultShape> {
    const s = await this.snapshot.get(userId);
    await this.ledger.setSection(userId, 'vault', s.prefs.vault.filter((_, i) => i !== index));
    return this.vault(userId);
  }
}
