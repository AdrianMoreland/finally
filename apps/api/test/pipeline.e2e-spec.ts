import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { provisionDefaults, type Db } from '@finally/db';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { OnboardingService } from '../src/auth/onboarding.service';
import { PRISMA, type AuthUser } from '../src/common/tokens';

/**
 * sync → categorise → answer → re-categorise, on the mock bank and market providers with inline jobs.
 * Runs against the configured database using a throwaway user that is deleted afterwards.
 */
describe('Finally pipeline (e2e)', () => {
  let app: INestApplication;
  let db: Db;
  let user: AuthUser;
  const email = `e2e-${Date.now()}@test.invalid`;

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

    const row = await db.user.create({
      data: { email, authId: `e2e-${Date.now()}`, displayName: 'E2E', monthlySavingsTarget: '630.00' },
    });
    await provisionDefaults(db, row.id);
    user = { id: row.id, authId: row.authId, email };
    await app.get(OnboardingService).ensureOnboarded(row.id);
  });

  afterAll(async () => {
    if (user) await db.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await app?.close();
  });

  it('rejects unauthenticated requests when the real guard is in place', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const bare = moduleRef.createNestApplication();
    await bare.init();
    await request(bare.getHttpServer()).get('/overview').expect(401);
    await request(bare.getHttpServer()).get('/health').expect(200);
    await bare.close();
  });

  it('onboarding synced both banks and categorised what the rules know', async () => {
    const { body } = await http().get('/accounts').expect(200);
    expect(body.map((a: { name: string }) => a.name).sort()).toEqual(
      ['AIB Current', 'Rainy day vault', 'Revolut EUR', 'Summer trip vault'].sort(),
    );
    const total = await http().get('/transactions?limit=1').expect(200);
    expect(total.body.total).toBeGreaterThan(200);
    const sorted = await http().get('/transactions?needsReview=false&kind=SPEND&limit=200').expect(200);
    expect(sorted.body.items.length).toBeGreaterThan(100);
    expect(sorted.body.items.every((t: { category: unknown }) => t.category !== null)).toBe(true);
  });

  it('keeps transfers out of spending and pairs AIB → Revolut top-ups', async () => {
    const { body } = await http().get('/transactions?kind=TRANSFER&limit=200').expect(200);
    expect(body.total).toBeGreaterThanOrEqual(10);
    expect(body.items.every((t: { category: { slug: string } | null }) => t.category?.slug === 'transfers')).toBe(true);
  });

  it('queues unknown merchants as one request each with a suggested group', async () => {
    const { body } = await http().get('/categorise/queue').expect(200);
    expect(body.count).toBeGreaterThanOrEqual(5);
    const keys = body.items.map((i: { merchantKey: string }) => i.merchantKey);
    expect(new Set(keys).size).toBe(keys.length);
    const bewleys = body.items.find((i: { merchantKey: string }) => i.merchantKey === 'bewleys-grafton-st');
    expect(bewleys).toBeDefined();
    expect(bewleys.askGroup).toBe('FOOD');
    expect(bewleys.paymentCount).toBeGreaterThanOrEqual(3);
    expect(bewleys.suggestedCategories.map((c: { slug: string }) => c.slug)).toEqual(['coffee', 'eating-out', 'groceries']);
  });

  let queueBefore = 0;
  let coffeeId = '';

  it('answering with merchant scope remembers the merchant and re-categorises every past payment', async () => {
    const queue = (await http().get('/categorise/queue').expect(200)).body;
    queueBefore = queue.count;
    const bewleys = queue.items.find((i: { merchantKey: string }) => i.merchantKey === 'bewleys-grafton-st');
    coffeeId = bewleys.suggestedCategories.find((c: { slug: string }) => c.slug === 'coffee').id;

    const res = await http().post(`/categorise/${bewleys.id}`).send({ categoryId: coffeeId, scope: 'merchant' }).expect(201);
    expect(res.body.updatedCount).toBe(bewleys.paymentCount);

    const after = (await http().get('/categorise/queue').expect(200)).body;
    expect(after.count).toBe(queueBefore - 1);

    const txs = (await http().get('/transactions?q=bewleys&limit=50').expect(200)).body;
    expect(txs.items.length).toBe(bewleys.paymentCount);
    expect(txs.items.every((t: { category: { slug: string }; needsReview: boolean; categorisedBy: string }) => t.category.slug === 'coffee' && !t.needsReview && t.categorisedBy === 'RULE')).toBe(true);

    const rules = (await http().get('/rules').expect(200)).body;
    expect(rules.some((r: { pattern: string; source: string; matchType: string }) => r.pattern === 'bewleys-grafton-st' && r.source === 'USER' && r.matchType === 'EXACT')).toBe(true);

    await http().post(`/categorise/${bewleys.id}`).send({ categoryId: coffeeId, scope: 'merchant' }).expect(400);
  });

  it('applies the remembered rule to a new payment without asking again', async () => {
    const csv = [
      'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
      'CARD_PAYMENT,Current,2026-10-14 09:00:00,2026-10-14 09:01:00,VDC-BEWLEYS GRAFTON ST,-4.20,0.00,EUR,COMPLETED,400.00',
    ].join('\n');
    const imp = await http().post('/banking/import').send({ institution: 'REVOLUT', csv }).expect(200);
    expect(imp.body.imported).toBe(1);
    const again = await http().post('/banking/import').send({ institution: 'REVOLUT', csv }).expect(200);
    expect(again.body).toMatchObject({ imported: 0, duplicates: 1 });

    const txs = (await http().get('/transactions?q=bewleys&limit=50').expect(200)).body;
    const fresh = txs.items.find((t: { bookingDate: string }) => t.bookingDate.startsWith('2026-10-14') );
    expect(fresh).toBeDefined();
    expect(fresh.category.slug).toBe('coffee');
    expect((await http().get('/categorise/queue').expect(200)).body.count).toBe(queueBefore - 1);
  });

  it('"just this once" changes a single payment and leaves the request open', async () => {
    const queue = (await http().get('/categorise/queue').expect(200)).body;
    const multi = queue.items.find((i: { paymentCount: number }) => i.paymentCount > 1);
    expect(multi).toBeDefined();
    const catId = multi.suggestedCategories[0]?.id ?? coffeeId;
    const res = await http().post(`/categorise/${multi.id}`).send({ categoryId: catId, scope: 'once' }).expect(201);
    expect(res.body.updatedCount).toBe(1);
    const after = (await http().get('/categorise/queue').expect(200)).body;
    const same = after.items.find((i: { id: string }) => i.id === multi.id);
    expect(same.paymentCount).toBe(multi.paymentCount - 1);
  });

  it('inline recategorisation of a transaction offers the merchant scope', async () => {
    const txs = (await http().get('/transactions?q=tesco&limit=5').expect(200)).body;
    const t = txs.items[0];
    const household = (await http().get('/categories').expect(200)).body.find((c: { slug: string }) => c.slug === 'household');
    const res = await http().post(`/transactions/${t.id}/category`).send({ categoryId: household.id, scope: 'merchant' }).expect(200);
    expect(res.body.updatedCount).toBeGreaterThan(1);
  });

  it('serves Overview, budgets, insights, investments and tools with real numbers', async () => {
    const o = (await http().get('/overview').expect(200)).body;
    expect(o.accounts.length).toBe(4);
    expect(Number(o.netWorth.current)).toBeGreaterThan(0);
    expect(o.netWorth.series).toHaveLength(12);
    expect(o.toSortCount).toBe((await http().get('/categorise/queue').expect(200)).body.count);
    expect(Number.isFinite(Number(o.safeToSpend.perDay))).toBe(true);
    expect(o.topCategories.length).toBeGreaterThan(3);

    const b = (await http().get('/budgets').expect(200)).body;
    expect(b.rows.length).toBeGreaterThan(5);
    expect(b.rows.find((r: { category: { slug: string } }) => r.category.slug === 'rent').spent).toBe('1100.00');

    const ins = (await http().post('/insights/refresh').expect(200)).body;
    expect(ins.items.length).toBeGreaterThan(0);

    const inv = (await http().get('/investments').expect(200)).body;
    expect(inv.holdings.map((h: { instrument: { symbol: string } }) => h.instrument.symbol).sort()).toEqual(['EIMI', 'GOLD', 'VWCE']);
    expect(inv.deemedDisposals.length).toBeGreaterThan(0);
    expect(inv.taxRulesInForce.some((r: { regime: string }) => r.regime === 'EXIT_TAX')).toBe(true);
    expect(inv.disclaimer).toContain('not financial advice');

    const where = (await http().post('/tools/where-should-it-go').send({ amount: '10000', years: 10, annualReturnPct: 6 }).expect(200)).body;
    expect(where.options).toHaveLength(3);

    const goals = (await http().get('/goals').expect(200)).body;
    expect(goals.length).toBe(2);
  });

  it('exports JSON and CSV', async () => {
    const csv = await http().get('/me/export?format=csv').expect(200);
    expect(csv.text.split('\n')[0]).toContain('raw_descriptor');
    const json = await http().get('/me/export?format=json').expect(200);
    expect(JSON.parse(json.text).transactions.length).toBeGreaterThan(200);
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
