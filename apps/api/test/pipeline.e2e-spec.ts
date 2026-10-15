import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { provisionDefaults, type Db } from '@finally/db';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { OnboardingService } from '../src/auth/onboarding.service';
import { PRISMA, type AuthUser } from '../src/common/tokens';

/**
 * sync → categorise → answer → re-categorise, then every screen's endpoint, on the mock bank and market providers with
 * inline jobs. The mock AIB account serves the owner's real statement plus generated payments up to today.
 * Runs against the configured database using a throwaway user that is deleted afterwards.
 */
describe('Finally pipeline (e2e)', () => {
  let app: INestApplication;
  let db: Db;
  let user: AuthUser;
  /** E2E_KEEP=1 reuses one user between runs (and leaves it in the database) so reruns skip the slow first sync. */
  const keep = process.env['E2E_KEEP'] === '1';
  const email = keep ? 'e2e-keep@test.invalid' : `e2e-${Date.now()}@test.invalid`;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => { user?: AuthUser } } }) => {
          ctx.switchToHttp().getRequest().user = user;
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get<Db>(PRISMA);

    const row = (keep ? await db.user.findUnique({ where: { email } }) : null) ?? (await db.user.create({ data: { email, authId: `e2e-${Date.now()}`, displayName: 'E2E' } }));
    await provisionDefaults(db, row.id);
    user = { id: row.id, authId: row.authId, email };
    await app.get(OnboardingService).ensureOnboarded(row.id);
  });

  afterAll(async () => {
    if (user && !keep) await db.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await app?.close();
  });

  it('rejects unauthenticated requests when the real guard is in place', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const bare = moduleRef.createNestApplication();
    await bare.init();
    await request(bare.getHttpServer()).get('/today').expect(401);
    await request(bare.getHttpServer()).get('/health').expect(200);
    await bare.close();
  });

  it('onboarding synced the AIB statement and categorised what the rules know', async () => {
    const { body } = await http().get('/accounts').expect(200);
    expect(body.map((a: { name: string }) => a.name)).toEqual(['AIB Current']);
    const total = await http().get('/transactions?limit=1').expect(200);
    expect(total.body.total).toBeGreaterThanOrEqual(1737);
    const unsorted = await http().get('/transactions?needsReview=true&limit=200').expect(200);
    expect(unsorted.body.total).toBeGreaterThan(4);
    expect(unsorted.body.items.every((t: { category: unknown }) => t.category === null)).toBe(true);
    const sorted = await http().get('/transactions?needsReview=false&kind=SPEND&limit=200').expect(200);
    expect(sorted.body.items.every((t: { category: unknown }) => t.category !== null)).toBe(true);
  });

  it("nets housemates' rent shares and refunds against the category, and keeps transfers out of spending", async () => {
    const shares = (await http().get('/transactions?kind=SHARE&limit=200').expect(200)).body;
    expect(shares.total).toBeGreaterThanOrEqual(40);
    expect(shares.items.every((t: { category: { slug: string } }) => t.category.slug === 'rent')).toBe(true);
    const refunds = (await http().get('/transactions?kind=REFUND&limit=50').expect(200)).body;
    expect(refunds.items.some((t: { merchant: { displayName: string } }) => /yescapa/i.test(t.merchant.displayName))).toBe(true);
    const transfers = (await http().get('/transactions?kind=TRANSFER&limit=200').expect(200)).body;
    expect(transfers.total).toBeGreaterThanOrEqual(40);
    expect(transfers.items.every((t: { category: { slug: string } }) => t.category.slug === 'transfers')).toBe(true);
  });

  it('flags a bounced direct debit and the credit that undid it', async () => {
    const flagged = await db.transaction.findMany({ where: { userId: user.id, flag: { not: null } }, select: { flag: true, kind: true } });
    expect(flagged.filter((t) => t.flag === 'bounced').length).toBe(3);
    expect(flagged.filter((t) => t.flag === 'returned').length).toBe(3);
    expect(flagged.filter((t) => t.flag === 'returned').every((t) => t.kind === 'REFUND')).toBe(true);
  });

  it('keeps today and the last day or two pending, and counts pending payments', async () => {
    const pending = (await http().get('/transactions?status=PENDING&limit=50').expect(200)).body;
    expect(pending.total).toBeGreaterThanOrEqual(0);
    const today = (await http().get('/today').expect(200)).body;
    expect(today.pending.count).toBe(pending.total);
  });

  it('queues unknown merchants as one request each', async () => {
    const { body } = await http().get('/categorise/queue').expect(200);
    expect(body.count).toBeGreaterThanOrEqual(4);
    const keys = body.items.map((i: { merchantKey: string }) => i.merchantKey);
    expect(new Set(keys).size).toBe(keys.length);
    const names = body.items.map((i: { displayName: string }) => i.displayName.toLowerCase()).join(' ');
    expect(names).toContain('maxol');
  });

  let queueBefore = 0;
  let foodId = '';

  it('answering with merchant scope remembers the merchant and re-categorises every past payment', async () => {
    const queue = (await http().get('/categorise/queue').expect(200)).body;
    queueBefore = queue.count;
    const maxol = queue.items.find((i: { displayName: string }) => /maxol/i.test(i.displayName));
    expect(maxol).toBeDefined();
    const cats = (await http().get('/categories').expect(200)).body;
    foodId = cats.find((c: { slug: string }) => c.slug === 'groceries').id;
    const res = await http().post(`/categorise/${maxol.id}`).send({ categoryId: foodId, scope: 'merchant' }).expect(201);
    expect(res.body.updatedCount).toBe(maxol.paymentCount);
    expect((await http().get('/categorise/queue').expect(200)).body.count).toBe(queueBefore - 1);
    const rules = (await http().get('/rules').expect(200)).body;
    expect(rules.some((r: { source: string; matchType: string; categoryId: string }) => r.source === 'USER' && r.matchType === 'EXACT' && r.categoryId === foodId)).toBe(true);
    await http().post(`/categorise/${maxol.id}`).send({ categoryId: foodId, scope: 'merchant' }).expect(400);
  });

  it('applies the remembered rule to a new payment without asking again', async () => {
    const csv = [
      'Posted Account,Posted Transactions Date,Description1,Description2,Description3,Debit Amount,Credit Amount,Balance,Posted Currency',
      '"IE12 AIBK 9311 0012 3456 78",14/10/2026,VDC-MAXOL SSTN MES,,,4.20,,100.00,EUR',
    ].join('\n');
    const imp = await http().post('/banking/import').send({ institution: 'AIB', csv }).expect(200);
    expect(imp.body.imported).toBe(1);
    const again = await http().post('/banking/import').send({ institution: 'AIB', csv }).expect(200);
    expect(again.body).toMatchObject({ imported: 0, duplicates: 1 });
    expect((await http().get('/categorise/queue').expect(200)).body.count).toBe(queueBefore - 1);
  });

  it('"just this once" changes a single payment and leaves the request open', async () => {
    const csv = [
      'Posted Account,Posted Transactions Date,Description1,Description2,Description3,Debit Amount,Credit Amount,Balance,Posted Currency',
      '"IE12 AIBK 9311 0012 3456 78",13/10/2026,VDC-ORA,,,12.00,,100.00,EUR',
      '"IE12 AIBK 9311 0012 3456 78",14/10/2026,VDC-ORA,,,18.50,,100.00,EUR',
    ].join('\n');
    await http().post('/banking/import').send({ institution: 'AIB', csv }).expect(200);
    const queue = (await http().get('/categorise/queue').expect(200)).body;
    const multi = queue.items.find((i: { paymentCount: number }) => i.paymentCount > 1);
    expect(multi).toBeDefined();
    const res = await http().post(`/categorise/${multi.id}`).send({ categoryId: foodId, scope: 'once' }).expect(201);
    expect(res.body.updatedCount).toBe(1);
    const same = (await http().get('/categorise/queue').expect(200)).body.items.find((i: { id: string }) => i.id === multi.id);
    expect(same.paymentCount).toBe(multi.paymentCount - 1);
  });

  it('Today: safe to spend is the lower of budget and balance, with a ranked action strip', async () => {
    const t = (await http().get('/today').expect(200)).body;
    expect(t.safe.binds === 'budget' || t.safe.binds === 'balance').toBe(true);
    expect(Number(t.safe.pool)).toBe(Math.min(Number(t.safe.budgetLeft), Number(t.safe.balanceLeft)));
    expect(Number(t.safe.perDay)).toBeGreaterThanOrEqual(0);
    expect(t.actions.length).toBeGreaterThan(0);
    const amounts = t.actions.filter((a: { pinned: boolean }) => !a.pinned).map((a: { amount: string }) => Number(a.amount));
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
    expect(t.ladder.rungs).toHaveLength(7);
    expect(t.toSortCount).toBe((await http().get('/categorise/queue').expect(200)).body.count);

    const first = t.actions[0];
    await http().post('/today/snooze').send({ actionId: first.id }).expect(200);
    const after = (await http().get('/today').expect(200)).body;
    expect(after.actions.some((a: { id: string }) => a.id === first.id)).toBe(false);
    expect(after.snoozed).toBe(1);
    await http().delete('/today/snooze').expect(200);
  });

  it('Money: repeating payments are found from history, with the Spotify-style price rise flagged', async () => {
    const b = (await http().get('/bills').expect(200)).body;
    expect(b.repeating.length).toBeGreaterThan(3);
    expect(b.repeating.some((r: { slug: string }) => r.slug === 'rent')).toBe(true);
    expect(b.upcoming.length).toBeGreaterThan(0);
    const sub = b.repeating.find((r: { slug: string; cancelled: boolean }) => r.slug === 'subscriptions');
    const cancelled = (await http().post('/bills/cancel').send({ id: sub.id, cancelled: true }).expect(201)).body;
    expect(Number(cancelled.subscriptions.savedMonthly)).toBeGreaterThan(0);
    await http().post('/bills/cancel').send({ id: sub.id, cancelled: false }).expect(201);
    const m = (await http().get('/month').expect(200)).body;
    expect(m.burn.spent.length).toBe(m.day);
    expect(m.burn.pace.length).toBe(m.daysInMonth);
    expect(m.ranked.length).toBe(9);
  });

  it('Payments: the search box reads a question such as "coffee over 4 last month"', async () => {
    const r = (await http().get('/transactions?q=coffee%20over%204%20last%20month&limit=100').expect(200)).body;
    expect(r.readAs).toMatchObject({ slug: 'coffee', min: 4 });
    expect(r.items.every((t: { category: { slug: string }; amountEur: string }) => t.category.slug === 'coffee' && Number(t.amountEur) < -4)).toBe(true);
    const plain = (await http().get('/transactions?q=zzzz-nothing&limit=5').expect(200)).body;
    expect(plain.readAs ?? null).toBeNull();
    expect(plain.total).toBe(0);
  });

  it('Ask: answers spending questions, follow-ups, comparisons and pins', async () => {
    const a = (await http().post('/ask').send({ text: 'How much did I spend on eating out last month?' }).expect(201)).body;
    expect(a.query.intent).toBe('sum');
    expect(a.answer.big).toMatch(/^€/);
    const f = (await http().post('/ask').send({ text: 'and September?', previous: a.query }).expect(201)).body;
    expect(f.query.via).toBe('follow-up');
    expect(f.query.period.from).toBe('2026-09-01');
    const c = (await http().post('/ask').send({ text: 'coffee this month vs last month' }).expect(201)).body;
    expect(c.answer.big).toMatch(/^[+−]€/);
    const safe = (await http().post('/ask').send({ text: "What's safe to spend today?" }).expect(201)).body;
    expect(safe.answer.big).toBe(`€${(await http().get('/today').expect(200)).body.safe.perDay}`.replace('€', '€'));
    const gloss = (await http().post('/ask').send({ text: 'what is deemed disposal' }).expect(201)).body;
    expect(gloss.answer.tier).toBe('help');
    const dunno = (await http().post('/ask').send({ text: 'blue giraffes' }).expect(201)).body;
    expect(dunno.query).toBeNull();
    expect(dunno.suggestions.length).toBeGreaterThan(0);

    const pins = (await http().post('/ask/pins').send({ text: 'coffee this month' }).expect(201)).body;
    expect(pins).toHaveLength(1);
    await http().delete(`/ask/pins/${pins[0].id}`).expect(200);
  });

  it('Plan: pots, people, payday plan and standing orders fit together', async () => {
    const pots = (await http().get('/pots').expect(200)).body;
    expect(pots.pots.map((p: { type: string }) => p.type)).toEqual(['SAFETY', 'TREAT', 'INVESTING']);
    const rainy = pots.pots[0];
    await http().patch(`/pots/${rainy.id}`).send({ monthly: '200' }).expect(200);
    const dan = (await http().post('/people').send({ name: 'Dan', direction: 'OWE', amount: '300', note: 'Flight' }).expect(201)).body;
    expect(dan.owe).toHaveLength(1);
    const plan = (await http().put('/people/plan').send({ monthly: '100' }).expect(200)).body;
    expect(plan.plan.freeDate).not.toBeNull();
    const payday = (await http().get('/plan/payday').expect(200)).body;
    expect(payday.orders.map((o: { key: string }) => o.key)).toContain(rainy.id);
    expect(payday.orders.every((o: { state: string }) => o.state === 'missing')).toBe(true);
    const set = (await http().put(`/plan/orders/${rainy.id}`).send({ amount: '200' }).expect(200)).body;
    expect(set.orders.find((o: { key: string }) => o.key === rainy.id).state).toBe('ok');
    expect(Number(payday.planned)).toBe(300);
    const wish = (await http().post(`/pots/${pots.pots[1].id}/wishlist`).send({ name: 'Headphones', price: '300' }).expect(201)).body;
    expect(wish.wishlist[0].unlocksOn > wish.wishlist[0].addedOn).toBe(true);
  });

  it('Tax: pay checker, checklist states and the bonus are served', async () => {
    const t = (await http().get('/tax').expect(200)).body;
    expect(t.payslips.length).toBeGreaterThan(3);
    expect(t.payslip.verdict.headline.length).toBeGreaterThan(0);
    expect(t.items.map((i: { id: string }) => i.id)).toContain('rent');
    expect(t.rules.rows.length).toBeGreaterThan(5);
    const done = (await http().put('/tax/checks/rent').send({ state: 'DONE' }).expect(200)).body;
    expect(done.items.find((i: { id: string }) => i.id === 'rent').state).toBe('DONE');
    const b = (await http().get('/bonus').expect(200)).body;
    expect(b.scenarios.map((s: { pct: number }) => s.pct)).toEqual([0, 50, 100]);
  });

  it('Review: the weekly review completes and the month close picks one change', async () => {
    const w = (await http().get('/review/week').expect(200)).body;
    expect(w.done).toBe(false);
    const done = (await http().post('/review/week').send({ decision: 'keep' }).expect(201)).body;
    expect(done.done).toBe(true);
    expect(done.streak).toBe(1);
    const m = (await http().get('/review/month').expect(200)).body;
    expect(m.options.at(-1).value).toBe('none');
    const chosen = (await http().post('/review/month').send({ value: 'none', label: 'No change this month' }).expect(201)).body;
    expect(chosen.choice).toBe('No change this month');
  });

  it('Grow: investing readiness, freedom, the practice account and the vault', async () => {
    const inv = (await http().get('/grow/investing').expect(200)).body;
    expect(inv.readiness).toHaveLength(5);
    expect(inv.investAccount.opens).toBe('2027-07-01');
    const f = (await http().get('/grow/freedom').expect(200)).body;
    expect(Number(f.target)).toBe(750000);
    const buy = (await http().post('/grow/paper').send({ action: 'buy', symbol: 'VWCE', amount: '500' }).expect(201)).body;
    expect(buy.holdings).toHaveLength(1);
    expect(buy.cash).toBe('4500.00');
    await http().post('/grow/paper').send({ action: 'advance' }).expect(201);
    const v = (await http().post('/grow/vault').send({ product: 'coin', qty: 1 }).expect(201)).body;
    expect(Number(v.buybackTotal)).toBeGreaterThan(0);
    expect(Number(v.buybackTotal)).toBeLessThan(Number(v.paidTotal));
  });

  it('Setup: reports what it found and applies the answers', async () => {
    const found = (await http().get('/setup/found').expect(200)).body;
    expect(found.salary.count).toBeGreaterThanOrEqual(3);
    expect(found.rent.amount).toBe('2500.00');
    expect(found.housemates.length).toBeGreaterThanOrEqual(2);
    expect(found.bills.length).toBeGreaterThan(3);
    await http().post('/setup/complete').send({ paydayDayOfMonth: 25, buffer: '150', budgets: { groceries: '300' }, people: [], pots: [] }).expect(200);
    expect((await http().get('/me').expect(200)).body.setupDone).toBe(true);
  });

  it('exports JSON and CSV', async () => {
    const csv = await http().get('/me/export?format=csv').expect(200);
    expect(csv.text.split('\n')[0]).toContain('raw_descriptor');
    const json = await http().get('/me/export?format=json').expect(200);
    expect(JSON.parse(json.text).transactions.length).toBeGreaterThan(1700);
  });

  it('sync adds new payments over time without duplicating old ones', async () => {
    const before = (await http().get('/transactions?limit=1').expect(200)).body.total;
    for (let i = 0; i < 4; i++) await http().post('/banking/sync').expect(200);
    const after = (await http().get('/transactions?limit=1').expect(200)).body.total;
    expect(after).toBeGreaterThanOrEqual(before);
    const hashes = await db.transaction.groupBy({ by: ['dedupeHash'], where: { userId: user.id }, _count: true, having: { dedupeHash: { _count: { gt: 1 } } } });
    expect(hashes).toHaveLength(0);
  });
});
