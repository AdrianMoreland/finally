import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from '@finally/db';
import type { AnswerDto, AskResponse, ParsedQueryDto } from '@finally/contracts';
import {
  answerSpend,
  D,
  dl,
  dlY,
  Decimal,
  eur,
  eur0,
  followUpQuestion,
  GLOSSARY,
  nthPayday,
  parseQuestion,
  periodByKey,
  previousPeriod,
  periodOptions,
  reachText,
  potReach,
  potTarget,
  SPEND_INTENTS,
  SUGGESTIONS,
  spent,
  sum,
  type AskContext,
  type ParsedQuery,
} from '@finally/finance-core';
import { InjectDb } from '../common/tokens';
import { LedgerService } from '../data/ledger.service';
import { PeopleService } from '../people/people.service';
import { PotsService } from '../pots/pots.service';
import { SnapshotService, type Snapshot } from '../snapshot/snapshot.service';

/** Extra words people use for a merchant, by merchant key. The merchant's own name always works too. */
const EXTRA_ALIASES: Record<string, string[]> = {
  'free-now': ['freenow'],
  freenow: ['free now', 'freenow'],
  'irish-rail': ['irish rail', 'dart'],
  virgin: ['virgin media', 'broadband'],
  tesco: ['tesco'],
};

const PRICE_SYMBOLS: Record<string, { name: string; px: number }> = {
  VWCE: { name: 'Vanguard FTSE All-World UCITS ETF (Acc)', px: 136.2 },
  CSPX: { name: 'iShares Core S&P 500 UCITS ETF (Acc)', px: 598.4 },
  EIMI: { name: 'iShares Core MSCI EM IMI UCITS ETF', px: 31.1 },
  GOLD: { name: 'Gold, per troy ounce', px: 3380 },
};
const SILVER_OZ = 40.2;

interface AskEnv {
  ctx: AskContext;
  shares: Set<string>;
  merchantNames: Map<string, string>;
  /** Open sort requests: merchant key → the group (food, fun…) it was filed under. */
  askGroups: Map<string, string>;
}

@Injectable()
export class AskService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly snapshot: SnapshotService,
    private readonly ledger: LedgerService,
    private readonly people: PeopleService,
    private readonly pots: PotsService,
  ) {}

  private normKey(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /** What Ask needs to read a question against this user's data. */
  private async context(s: Snapshot): Promise<AskEnv> {
    const merchants = await this.db.merchant.findMany({ where: { userId: s.userId }, select: { merchantKey: true, displayName: true } });
    const shares = new Set(s.txs.filter((t) => t.kind === 'SHARE' && t.merchantKey).map((t) => t.merchantKey!));
    const used = new Set(s.txs.map((t) => t.merchantKey).filter(Boolean) as string[]);
    const names = new Map(merchants.map((m) => [m.merchantKey, m.displayName]));
    const list = merchants
      .filter((m) => used.has(m.merchantKey))
      .map((m) => {
        const display = this.normKey(m.displayName.split(' ·')[0]!);
        const aliases = new Set<string>([...(display.length >= 3 ? [display] : []), ...(EXTRA_ALIASES[m.merchantKey] ?? [])]);
        const first = display.split(' ')[0]!;
        if (first.length >= 4 && display.split(' ').length > 1 && !['the', 'cafe', 'bar', 'pub'].includes(first)) aliases.add(first);
        return { key: m.merchantKey, name: m.displayName, aliases: [...aliases], share: shares.has(m.merchantKey) };
      });
    const first = s.txs[0]?.date ?? s.today;
    const ctx: AskContext = {
      today: s.today,
      lastPayday: s.lastPay,
      dataStart: first,
      merchants: list,
      categories: s.cats.map((c) => ({ slug: c.slug, name: c.name })),
      people: s.people.filter((p) => p.direction === 'OWE').map((p) => ({ id: p.id, name: p.name })),
    };
    const open = await this.db.categorisationRequest.findMany({ where: { userId: s.userId, status: 'OPEN' }, select: { merchantKey: true, askGroup: true } });
    return { ctx, shares, merchantNames: names, askGroups: new Map(open.map((r) => [r.merchantKey, r.askGroup])) };
  }

  async ask(userId: string, text: string, previous: ParsedQueryDto | null | undefined): Promise<AskResponse> {
    const s = await this.snapshot.get(userId);
    const env = await this.context(s);
    const follow = followUpQuestion(text, (previous as ParsedQuery | null | undefined) ?? null, env.ctx);
    const q = follow ?? parseQuestion(text, env.ctx, s.prefs.learned);
    return this.respond(s, env, q);
  }

  async evaluate(userId: string, query: ParsedQueryDto): Promise<AskResponse> {
    const s = await this.snapshot.get(userId);
    const env = await this.context(s);
    return this.respond(s, env, this.normalise(query as ParsedQuery, env.ctx));
  }

  /** The "Read as" chips send period keys; turn them back into dates, and give a comparison something to compare with. */
  private normalise(q: ParsedQuery, ctx: AskContext): ParsedQuery {
    const out: ParsedQuery = { ...q };
    if (q.period && q.period.key !== 'custom') out.period = periodByKey(ctx, q.period.key);
    if (!out.period && (SPEND_INTENTS as readonly string[]).includes(q.intent)) out.period = periodByKey(ctx, 'thismonth');
    if (q.intent === 'compare') {
      out.period2 = q.period2 && q.period2.key && q.period2.key !== 'custom' ? periodByKey(ctx, q.period2.key) : q.period2?.from ? q.period2 : previousPeriod(out.period!, ctx.today);
    }
    return out;
  }

  private async respond(s: Snapshot, env: AskEnv, q: ReturnType<typeof parseQuestion>): Promise<AskResponse> {
    const { ctx } = env;
    const options = {
      categories: s.cats.filter((c) => !c.archived && ['ESSENTIALS', 'LIFESTYLE'].includes(c.group)).map((c) => ({ slug: c.slug, name: c.name })),
      merchants: ctx.merchants.map((m) => ({ key: m.key, name: m.name })),
      periods: periodOptions(ctx),
    };
    if (!q) return { query: null, answer: null, suggestions: [], options, pinned: false };
    if ('unknown' in q) return { query: null, answer: null, suggestions: q.suggestions, options, pinned: false };
    const answer = await this.run(s, env, q);
    const pins = await this.db.pinnedQuestion.findMany({ where: { userId: s.userId } });
    return { query: q as ParsedQueryDto, answer, suggestions: [], options, pinned: pins.some((p) => p.text === q.text) };
  }

  /** Answer a parsed question from this user's data. Only the symbol or topic of public questions ever leaves the server. */
  async run(s: Snapshot, env: AskEnv, q: ParsedQuery): Promise<AnswerDto> {
    const { shares, merchantNames, askGroups } = env;
    const base: AnswerDto = { tier: 'rules', sent: 'nothing', big: '', short: '', text: '' };
    const names = {
      category: (slug: string) => s.names[slug] ?? slug,
      merchant: (key: string) => merchantNames.get(key) ?? key,
      shareMerchants: shares,
    };
    if ((SPEND_INTENTS as readonly string[]).includes(q.intent)) {
      const unsorted = (slug: string, from: string, to: string): string[] => {
        const cat = s.cats.find((c) => c.slug === slug);
        const group = cat ? (cat.parentId ? s.cats.find((c) => c.id === cat.parentId)?.askGroup : cat.askGroup) : null;
        const families = new Set([cat?.askGroup, group].filter(Boolean));
        return s.txs
          .filter((t) => t.kind === 'SPEND' && t.slug === null && t.date >= from && t.date <= to && t.merchantKey && families.has(askGroups.get(t.merchantKey)))
          .map((t) => t.merchantName);
      };
      return answerSpend(q, s.txs, names, unsorted);
    }

    const { intent } = q;
    switch (intent) {
      case 'gloss': {
        const g = GLOSSARY[q.term ?? ''];
        return { ...base, tier: 'help', big: g?.[0] ?? '', short: g?.[0] ?? '', text: g?.[1] ?? '' };
      }
      case 'price': {
        const sym = q.sym ?? 'GOLD';
        const px = sym === 'SILVER' ? SILVER_OZ : (PRICE_SYMBOLS[sym]?.px ?? 0);
        const label = sym === 'SILVER' ? 'Silver, per troy ounce' : (PRICE_SYMBOLS[sym]?.name ?? sym);
        return { ...base, tier: 'public', sent: `the symbol "${sym === 'SILVER' ? 'XAG' : sym === 'GOLD' ? 'XAU' : sym}"`, big: eur(px.toFixed(2)), short: sym === 'SILVER' ? 'Silver' : sym, text: `${label}. Sample delayed price.` };
      }
      case 'news':
        return {
          ...base,
          tier: 'public',
          sent: `the topic "${q.topic}"`,
          big: `Headlines: ${q.topic}`,
          short: 'Headlines',
          text: 'The real app pulls headlines from news feeds and shows them as links, without summarising them with AI. These are samples.',
          rows: [
            { label: `Central banks keep adding to ${q.topic === 'gold' ? 'gold reserves' : 'bond holdings'} as rates ease`, value: 'sample' },
            { label: 'Dollar slips after US jobs data', value: 'sample' },
            { label: 'European shares edge higher in quiet trading', value: 'sample' },
          ],
        };
      case 'vault': {
        const bought = s.prefs.vault.reduce((a, v) => a + v.paid, 0);
        return { ...base, big: eur((bought * 0.98).toFixed(2)), short: 'Your metal', text: s.prefs.vault.length ? 'What a dealer would pay for your metal today, at spot minus 2%.' : 'You have no gold or silver in your vault yet. Add some in Investing.', action: { label: 'Open Investing', to: '/grow/investing' } };
      }
      case 'owed': {
        const owed = s.people.filter((p) => p.direction === 'OWED');
        const open = owed.filter((p) => this.people.left(s, p).gt(0));
        return {
          ...base,
          big: eur(this.people.totals(s).owed.toFixed(2)),
          short: 'Owed to you',
          text: `${open.length} ${open.length === 1 ? 'person still owes' : 'people still owe'} you. Repayments are matched when the transfer arrives.`,
          rows: owed.map((p) => ({ label: `${p.name}${p.note ? ` · ${p.note}` : ''}`, value: this.people.left(s, p).gt(0) ? eur(this.people.left(s, p).toFixed(2)) : 'Paid' })),
          action: { label: 'Open People', to: '/plan/people' },
        };
      }
      case 'debt': {
        const plan = this.people.payoff(s);
        const owe = s.people.filter((p) => p.direction === 'OWE');
        const person = q.personId ? owe.find((p) => p.id === q.personId) : null;
        if (person) {
          const l = this.people.left(s, person);
          return {
            ...base,
            big: eur(l.toFixed(2)),
            short: `Left for ${person.name}`,
            text: `Left to pay back to ${person.name}, from ${eur0(person.amount.toString())}. ${l.lte(0) ? 'All paid back.' : plan.done[person.id] ? `On your plan it's paid off on ${dlY(plan.done[person.id]!)}.` : 'Not scheduled with the current plan.'}`,
            action: { label: 'Open People', to: '/plan/people' },
          };
        }
        const total = this.people.totals(s).owe;
        return {
          ...base,
          big: eur(total.toFixed(2)),
          short: 'Left to pay back',
          text: !owe.length
            ? "You haven't added anyone you owe, and your statement shows no repayments to family or friends."
            : `Owed to ${owe.filter((p) => this.people.left(s, p).gt(0)).length} people. ${plan.freeDate ? `Everyone paid back on ${dlY(plan.freeDate)} at ${eur0(s.prefs.payback.monthly)} a month.` : 'Set a monthly amount in the payday plan to get a date.'}`,
          rows: owe.map((p) => ({ label: p.name, value: eur(this.people.left(s, p).toFixed(2)) })),
          action: { label: 'Open People', to: '/plan/people' },
        };
      }
      case 'afford': {
        const a = q.amount;
        if (!a) return { ...base, big: 'How much is it?', text: 'Add the price, for example "Can I afford €300 headphones?"' };
        const treat = s.pots.find((p) => p.type === 'TREAT');
        const rainy = s.pots.find((p) => p.type === 'SAFETY');
        const treatBal = treat ? D(this.snapshot.potBalance(treat)) : D(0);
        const treatMonthly = treat ? D(treat.monthly.toString()) : D(0);
        const short = Decimal.max(0, D(a).minus(treatBal));
        const months = treatMonthly.gt(0) ? short.div(treatMonthly).ceil().toNumber() : null;
        const when = short.lte(0) ? s.today : months != null ? nthPayday(s.today, s.user.paydayDayOfMonth, months, true) : null;
        const rainyMonthly = rainy ? D(rainy.monthly.toString()) : D(0);
        const weeksDelay = rainyMonthly.gt(0) ? D(a).div(rainyMonthly.div(4.33)) : null;
        const what = `${eur0(a)}${q.item ? ` for ${q.item}` : ''}`;
        return {
          ...base,
          big: short.lte(0) ? 'Yes, today' : when ? `Yes, on ${dl(when)}` : 'Not on this plan',
          short: `Afford ${eur0(a)}`,
          text: `Your Treats pot has ${eur(treatBal.toFixed(2))}${short.gt(0) ? (when ? ` and gets ${eur0(treatMonthly.toFixed(2))} each payday, so ${what} fits on ${dlY(when)} without touching other pots.` : '. Add money to Treats in the payday plan.') : `, enough for ${what} now.`}${weeksDelay ? ` Taking it from the rainy-day pot instead would set it back about ${Math.round(weeksDelay.toNumber())} weeks.` : " The rainy-day pot has nothing going in yet, so it can't cover it either."}${a >= 100 ? " It's over €100, so the 30-day rule applies if you add it to the wishlist." : ''}`,
          action: { label: 'Add to wishlist', to: '/plan/pots', extra: { wish: { name: q.item || 'New item', price: a } } },
        };
      }
      case 'safe': {
        const c = this.snapshot.safeAt(s);
        return { ...base, big: eur(c.perDay), short: 'Safe to spend today', text: `A day for the ${c.daysLeft} days to payday on ${dl(s.nextPay)}. Set by your ${c.binds === 'budget' ? 'flexible budgets' : 'balance'}, the lower of the two.`, action: { label: 'See the maths', to: '/', extra: { maths: true } } };
      }
      case 'networth': {
        const owed = this.people.totals(s);
        const potsTotal = sum(s.pots.map((p) => this.snapshot.potBalance(p)));
        const total = D(s.balance).plus(potsTotal).plus(owed.owed).minus(owed.owe);
        return { ...base, big: eur(total.toFixed(2)), short: 'Net worth', text: `Accounts and pots ${eur(D(s.balance).plus(potsTotal).toFixed(2))}, plus ${eur(owed.owed.toFixed(2))} owed to you, minus ${eur(owed.owe.toFixed(2))} you owe family and friends.` };
      }
      case 'balance':
        return {
          ...base,
          big: eur(s.balance),
          short: 'Current accounts',
          text: `${D(s.balance).lt(0) ? 'Overdrawn. ' : ''}Your balance on ${dl(s.today)}, plus ${eur(sum(s.pots.map((p) => this.snapshot.potBalance(p))).toFixed(2))} in pots.`,
          rows: s.pots.filter((p) => D(this.snapshot.potBalance(p)).gt(0)).map((p) => ({ label: `${p.name} pot`, value: eur(this.snapshot.potBalance(p)) })),
        };
      case 'runway': {
        const rainy = s.pots.find((p) => p.type === 'SAFETY');
        const bal = rainy ? D(this.snapshot.potBalance(rainy)) : D(0);
        const months = s.essentials.gt(0) ? bal.div(s.essentials) : D(0);
        const core = rainy ? this.pots.core(s, rainy) : null;
        const three = potTarget(core ?? { id: '', name: '', type: 'SAFETY', balance: '0', target: null, targetDate: null, monthly: '0' }, s.essentials);
        return { ...base, big: `${months.toFixed(1)} months`, short: 'Runway', text: `${eur(bal.toFixed(2))} covers ${months.toFixed(1)} months of essentials at ${eur0(s.essentials.toFixed(2))} a month. Three months is ${eur0(three.toFixed(2))}, reached on ${core ? reachText(potReach(core, three, s.cal)) : 'when you add a rainy-day pot'}.`, action: { label: 'Open Pots', to: '/plan/pots' } };
      }
      case 'upcoming': {
        const up = s.upcoming;
        if (!up.length) return { ...base, big: 'Nothing found', short: 'Next bill', text: 'No repeating bills found yet.' };
        return {
          ...base,
          big: `${up[0]!.name} · ${dl(up[0]!.date)}`,
          short: 'Next bill',
          text: `${eur(up[0]!.amount)} is next. ${eur(sum(up.filter((u) => u.date < s.nextPay).map((u) => u.amount)).toFixed(2))} of bills before payday.`,
          rows: up.slice(0, 6).map((u) => ({ label: `${dl(u.date)} · ${u.name}`, value: `${u.varies ? 'about ' : ''}${eur(u.amount)}` })),
        };
      }
      case 'subs': {
        const subs = s.repeating.filter((r) => r.slug === 'subscriptions' && !s.cancelled.has(r.id));
        const m = sum(subs.map((x) => x.amount));
        return { ...base, big: `${eur(m.toFixed(2))} a month`, short: 'Subscriptions', text: `${subs.length} subscriptions, ${eur(m.times(12).toFixed(2))} a year. Found from repeating payments.`, rows: subs.map((x) => ({ label: `${x.name} · since ${x.since.slice(0, 7)}`, value: eur(x.amount) })), action: { label: 'Review subscriptions', to: '/money/bills' } };
      }
      case 'income': {
        const p = q.period!;
        const inc = s.txs.filter((t) => t.kind === 'INCOME' && t.date >= p.from && t.date <= p.to);
        const wages = s.salary ? inc.filter((t) => t.rawDescriptor.replace(/\d+/g, '').replace(/\s+/g, ' ').trim().toUpperCase() === s.salary!.family).length : 0;
        const by = new Map<string, Decimal>();
        for (const t of inc) by.set(t.merchantName, (by.get(t.merchantName) ?? D(0)).plus(t.amount));
        return {
          ...base,
          big: eur(sum(inc.map((t) => t.amount)).toFixed(2)),
          short: `Income ${p.label.toLowerCase()}`,
          text: `Income ${p.label.toLowerCase()}: ${inc.length} payment${inc.length === 1 ? '' : 's'} in${wages ? `, ${wages} of them salary` : ''}. Refunds, housemates' rent and transfers between your own accounts aren't counted. Next payday ${dl(s.nextPay)}, about ${eur(s.netPay.toFixed(2))}.`,
          rows: [...by].sort((a, b) => b[1].comparedTo(a[1])).map(([k, v]) => ({ label: k, value: eur(v.toFixed(2)) })),
        };
      }
      case 'budget': {
        const slug = q.slug ? (s.cats.find((c) => c.slug === q.slug)?.parentId ? s.cats.find((c) => s.cats.find((x) => x.slug === q.slug)?.parentId === c.id)?.slug : q.slug) : null;
        if (slug && s.budgets[slug] !== undefined) {
          const sp = spent(s.txs, { slug, from: `${s.month}-01`, to: s.today });
          const b = D(s.budgets[slug]!);
          return { ...base, big: `${eur(b.minus(sp).toFixed(2))} left`, short: `${s.names[slug]} left`, text: `${s.names[slug]}: ${eur(sp.toFixed(2))} of ${eur0(b.toFixed(2))} spent this month.`, action: { label: 'Open Budgets', to: '/money/budgets' } };
        }
        const c = this.snapshot.safeAt(s);
        return { ...base, big: `${eur(c.budgetLeft)} left`, short: 'Flexible budgets left', text: `Across your flexible budgets: ${eur(D(c.spentFlex).plus(c.unsorted).toFixed(2))} of ${eur0(c.flexBudget)} spent. Unsorted payments count too.`, action: { label: 'Open Budgets', to: '/money/budgets' } };
      }
      default:
        return { ...base, big: 'Not sure', text: "I couldn't answer that one yet." };
    }
  }

  /**
   * The search box in Payments understands questions. When the text reads as a spending question with something
   * to filter by (a category, merchant, amount, account or period), return that reading; otherwise null for a plain
   * text search.
   */
  async parseForSearch(userId: string, text: string): Promise<ParsedQueryDto | null> {
    const s = await this.snapshot.get(userId);
    const { ctx } = await this.context(s);
    const q = parseQuestion(text, ctx, s.prefs.learned);
    if (!q || 'unknown' in q || !(SPEND_INTENTS as readonly string[]).includes(q.intent)) return null;
    const filters = q.slug || q.merchantKey || q.min != null || q.max != null || q.institution || q.periodExplicit;
    return filters ? (q as ParsedQueryDto) : null;
  }

  /* ------------------------------------------------------------------ pins */

  async pins(userId: string) {
    const s = await this.snapshot.get(userId);
    const env = await this.context(s);
    const rows = await this.db.pinnedQuestion.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } });
    const out = [];
    for (const r of rows) {
      const q = parseQuestion(r.text, env.ctx, s.prefs.learned);
      if (!q || 'unknown' in q) continue;
      const a = await this.run(s, env, q);
      out.push({ id: r.id, text: r.text, big: a.big, short: a.short });
    }
    return out;
  }

  async pin(userId: string, text: string) {
    const count = await this.db.pinnedQuestion.count({ where: { userId } });
    if (count >= 6) throw new ConflictException('You can pin up to six questions');
    await this.db.pinnedQuestion.upsert({ where: { userId_text: { userId, text } }, update: {}, create: { userId, text, sortOrder: count } });
    return this.pins(userId);
  }

  async unpin(userId: string, id: string) {
    const res = await this.db.pinnedQuestion.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw new NotFoundException('Pinned question not found');
    return this.pins(userId);
  }

  suggestions(): string[] {
    return SUGGESTIONS;
  }

  /** Remember that a phrase means a question Finally already understands. */
  async learn(userId: string, phrase: string, asText: string): Promise<void> {
    const key = this.normKey(phrase);
    if (!key) return;
    await this.ledger.patchPrefs(userId, { learned: { [key]: asText } });
  }
}

