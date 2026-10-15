import { BadRequestException, Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Db } from '@finally/db';
import {
  applyRules,
  eur,
  suggestAskGroup,
  type CoreRule,
  type KnownMerchant,
} from '@finally/finance-core';
import {
  ASK_GROUP_BUTTONS,
  askCategoryId,
  type AnswerCategoriseBody,
  type AskGroup,
  type CategoriseQueueResponse,
  type UpdatedCountResponse,
} from '@finally/contracts';
import { ENV, type Env } from '../common/env';
import { iso, isoOrNull, money } from '../common/mappers';
import { InjectDb } from '../common/tokens';
import { JobsService } from '../jobs/jobs.service';
import { PushService } from '../notifications/push.service';
import { AiSuggestService } from './ai-suggest.service';

const MAX_INDIVIDUAL_PUSHES = 5;
const DUBLIN = 'Europe/Dublin';

@Injectable()
export class CategorisationService implements OnModuleInit {
  private readonly log = new Logger(CategorisationService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly jobs: JobsService,
    private readonly push: PushService,
    private readonly ai: AiSuggestService,
  ) {}

  onModuleInit(): void {
    this.jobs.register('categorise', async (d) => {
      if (d.userId) await this.categoriseUser(d.userId);
    });
    this.jobs.register('flush-notifications', async (d) => {
      if (d.userId) await this.notifyOpenRequests(d.userId);
    });
    this.jobs.register('notify-digest', async (d) => {
      if (d.userId) await this.sendDigest(d.userId);
    });
  }

  /* ------------------------------------------------------------- crons */

  @Cron('0 */30 * * * *', { name: 'flush-notifications', timeZone: DUBLIN })
  async cronFlush(): Promise<void> {
    if (this.env.DISABLE_JOBS) return;
    for (const u of await this.db.user.findMany({ select: { id: true } })) {
      await this.jobs.enqueue('flush-notifications', { userId: u.id }, `flush:${u.id}`);
    }
  }

  @Cron('0 0 19 * * *', { name: 'notify-digest', timeZone: DUBLIN })
  async cronDigest(): Promise<void> {
    if (this.env.DISABLE_JOBS) return;
    for (const u of await this.db.user.findMany({ select: { id: true } })) {
      await this.jobs.enqueue('notify-digest', { userId: u.id }, `digest:${u.id}`);
    }
  }

  /* ------------------------------------------------------ categorisation */

  /**
   * Apply rules to every uncategorised payment. Unknown merchants are flagged `needsReview` and get one OPEN
   * request per merchantKey (later payments attach to the same request).
   */
  async categoriseUser(userId: string): Promise<{ categorised: number; flagged: number; requests: number }> {
    const [categories, ruleRows] = await Promise.all([
      this.db.category.findMany({ where: { userId } }),
      this.db.merchantRule.findMany({ where: { userId, active: true } }),
    ]);
    const bySlug = new Map(categories.map((c) => [c.slug, c]));
    const rules: CoreRule[] = ruleRows.map((r) => ({
      id: r.id,
      matchType: r.matchType,
      pattern: r.pattern,
      categoryId: r.categoryId,
      priority: r.priority,
      source: r.source,
      active: r.active,
    }));

    const pending = await this.db.transaction.findMany({
      where: { userId, categoryId: null, kind: { in: ['SPEND', 'REFUND', 'INCOME'] } },
      include: { merchant: true },
      orderBy: { bookingDate: 'asc' },
    });

    type Kind = 'SPEND' | 'INCOME' | 'TRANSFER' | 'REFUND' | 'SHARE';
    const groups = new Map<string, { categoryId: string; by: 'RULE' | 'SEED'; kind: Kind | null; ids: string[] }>();
    const unmatched = new Map<string, typeof pending>();
    const incomeId = bySlug.get('income')?.id;
    const catById = new Map(categories.map((c) => [c.id, c]));
    /** Money coming in takes its kind from the category it lands in: a housemate's rent share nets against Rent. */
    const kindOf = (categoryId: string, current: Kind): Kind => {
      const c = catById.get(categoryId);
      if (!c) return current;
      // A transfer between your own accounts is a transfer whichever way the money went.
      if (c.group === 'TRANSFER') return 'TRANSFER';
      if (current === 'SPEND') return current;
      if (c.group === 'INCOME') return 'INCOME';
      return c.slug === 'rent' ? 'SHARE' : 'REFUND';
    };
    const add = (categoryId: string, by: 'RULE' | 'SEED', kind: Kind | null, id: string): void => {
      const key = `${by}:${categoryId}:${kind ?? ''}`;
      const g = groups.get(key) ?? { categoryId, by, kind, ids: [] };
      g.ids.push(id);
      groups.set(key, g);
    };

    for (const tx of pending) {
      const target = { merchantKey: tx.merchant?.merchantKey ?? '', rawDescriptor: tx.rawDescriptor };
      const rule = target.merchantKey ? applyRules(target, rules) : null;
      if (tx.kind === 'INCOME' && !rule) {
        if (incomeId) add(incomeId, 'SEED', null, tx.id);
        continue;
      }
      if (rule) {
        add(rule.categoryId, rule.source === 'USER' ? 'RULE' : 'SEED', kindOf(rule.categoryId, tx.kind as Kind), tx.id);
      } else {
        const key = target.merchantKey || tx.rawDescriptor;
        unmatched.set(key, [...(unmatched.get(key) ?? []), tx]);
      }
    }

    let categorised = 0;
    for (const g of groups.values()) {
      // categoryId: null guards against a concurrent run (or a transfer link) that already decided these.
      const res = await this.db.transaction.updateMany({
        where: { id: { in: g.ids }, categoryId: null, kind: { in: ['SPEND', 'REFUND', 'INCOME'] } },
        data: { categoryId: g.categoryId, categorisedBy: g.by, needsReview: false, ...(g.kind ? { kind: g.kind } : {}) },
      });
      categorised += res.count;
    }

    await this.closeResolvedRequests(userId);

    let flagged = 0;
    let requests = 0;
    if (unmatched.size) {
      const known = await this.knownMerchants(userId);
      const allSlugs = categories.filter((c) => !c.archived).map((c) => c.slug);
      for (const [merchantKey, txs] of unmatched) {
        await this.db.transaction.updateMany({
          where: { id: { in: txs.map((t) => t.id) }, categoryId: null, kind: { in: ['SPEND', 'REFUND'] } },
          data: { needsReview: true, categorisedBy: 'NONE' },
        });
        flagged += txs.length;
        const open = await this.db.categorisationRequest.findFirst({ where: { userId, merchantKey, status: 'OPEN' } });
        if (open) continue;
        const first = txs[0]!;
        const displayName = first.merchant?.displayName ?? first.rawDescriptor;
        let { askGroup } = suggestAskGroup(merchantKey, first.rawDescriptor, known);
        let preferredSlug: string | null = null;
        if (askGroup === 'OTHER') {
          const ai = await this.ai.suggest({ displayName, rawDescriptor: first.rawDescriptor, categorySlugs: allSlugs });
          if (ai) {
            askGroup = ai.askGroup;
            preferredSlug = ai.categorySlug;
          }
        }
        const slugs = [...(preferredSlug ? [preferredSlug] : []), ...ASK_GROUP_BUTTONS[askGroup]];
        const suggested = [...new Set(slugs)].flatMap((s) => bySlug.get(s)?.id ?? []);
        try {
          await this.db.categorisationRequest.create({
            data: { userId, transactionId: first.id, merchantKey, askGroup, suggestedCategoryIds: suggested },
          });
          requests++;
        } catch {
          /* the partial unique index lost a race with a concurrent run: one OPEN request already exists */
        }
      }
    }
    if (requests) await this.notifyOpenRequests(userId);
    this.log.log(`categorised ${categorised}, flagged ${flagged}, new requests ${requests}`);
    return { categorised, flagged, requests };
  }

  /** A new or edited rule can sort a merchant that was waiting for an answer; close those requests. */
  private async closeResolvedRequests(userId: string): Promise<void> {
    const open = await this.db.categorisationRequest.findMany({ where: { userId, status: 'OPEN' } });
    for (const r of open) {
      const merchant = await this.db.merchant.findUnique({ where: { userId_merchantKey: { userId, merchantKey: r.merchantKey } } });
      if (!merchant) continue;
      const waiting = await this.db.transaction.count({ where: { userId, merchantId: merchant.id, categoryId: null, needsReview: true } });
      if (waiting === 0) await this.closeRequestsFor(userId, r.merchantKey);
    }
  }

  private async knownMerchants(userId: string): Promise<KnownMerchant[]> {
    const rows = await this.db.merchant.findMany({
      where: { userId, defaultCategoryId: { not: null } },
      include: { defaultCategory: { select: { askGroup: true } } },
    });
    return rows
      .filter((m) => m.defaultCategory)
      .map((m) => ({ merchantKey: m.merchantKey, displayName: m.displayName, askGroup: m.defaultCategory!.askGroup }));
  }

  /* --------------------------------------------------------- the queue */

  async queue(userId: string): Promise<CategoriseQueueResponse> {
    const reqs = await this.db.categorisationRequest.findMany({
      where: { userId, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });
    const keys = reqs.map((r) => r.merchantKey);
    const merchants = await this.db.merchant.findMany({ where: { userId, merchantKey: { in: keys } } });
    const merchantByKey = new Map(merchants.map((m) => [m.merchantKey, m]));
    const txs = await this.db.transaction.findMany({
      where: { userId, merchantId: { in: merchants.map((m) => m.id) }, needsReview: true },
      include: { account: { include: { connection: { select: { institution: true } } } } },
      orderBy: { bookingDate: 'desc' },
    });
    const txsByMerchant = new Map<string, typeof txs>();
    for (const t of txs) txsByMerchant.set(t.merchantId!, [...(txsByMerchant.get(t.merchantId!) ?? []), t]);
    const cats = await this.db.category.findMany({ where: { userId } });
    const catById = new Map(cats.map((c) => [c.id, c]));

    const items: CategoriseQueueResponse['items'] = [];
    for (const r of reqs) {
      const m = merchantByKey.get(r.merchantKey);
      const list = m ? (txsByMerchant.get(m.id) ?? []) : [];
      const latest = list[0];
      if (!latest) continue;
      items.push({
        id: r.id,
        merchantKey: r.merchantKey,
        displayName: m?.displayName ?? r.merchantKey,
        rawDescriptor: latest.rawDescriptor,
        askGroup: r.askGroup,
        status: r.status,
        amount: money(latest.amountEur),
        bookingDate: iso(latest.bookingDate),
        accountName: latest.account.name,
        institution: latest.account.connection.institution,
        paymentCount: list.length,
        suggestedCategories: r.suggestedCategoryIds.flatMap((id) => {
          const c = catById.get(id);
          return c ? [{ id: c.id, name: c.name, slug: c.slug, colour: c.colour, icon: c.icon, parentId: c.parentId }] : [];
        }),
        notifiedAt: isoOrNull(r.notifiedAt),
      });
    }
    return { items, count: items.length };
  }

  /** Close a request that has no remaining uncategorised payments (for example after a manual edit). */
  async closeRequestsFor(userId: string, merchantKey: string): Promise<void> {
    await this.db.categorisationRequest.updateMany({
      where: { userId, merchantKey, status: 'OPEN' },
      data: { status: 'ANSWERED', answeredAt: new Date() },
    });
  }

  /**
   * Remember a merchant: upsert the USER rule, set the merchant default and re-categorise every payment from it.
   */
  async applyToMerchant(userId: string, merchantId: string, categoryId: string): Promise<UpdatedCountResponse> {
    const [merchant, category] = await Promise.all([
      this.db.merchant.findFirst({ where: { id: merchantId, userId } }),
      this.db.category.findFirst({ where: { id: categoryId, userId, archived: false } }),
    ]);
    if (!merchant) throw new NotFoundException('Merchant not found');
    if (!category) throw new BadRequestException('Unknown category');
    await this.db.merchantRule.upsert({
      where: { userId_source_matchType_pattern: { userId, source: 'USER', matchType: 'EXACT', pattern: merchant.merchantKey } },
      update: { categoryId, active: true },
      create: { userId, matchType: 'EXACT', pattern: merchant.merchantKey, categoryId, priority: 100, source: 'USER', active: true },
    });
    await this.db.merchant.update({ where: { id: merchant.id }, data: { defaultCategoryId: categoryId } });
    const res = await this.db.transaction.updateMany({
      where: { userId, merchantId: merchant.id, kind: { in: ['SPEND', 'REFUND', 'SHARE'] } },
      data: { categoryId, categorisedBy: 'RULE', needsReview: false },
    });
    // Money coming back from this merchant now belongs to the new category too: refunds and rent shares net against it.
    if (category.group !== 'INCOME' && category.group !== 'TRANSFER') {
      await this.db.transaction.updateMany({
        where: { userId, merchantId: merchant.id, kind: { in: ['REFUND', 'SHARE'] } },
        data: { kind: category.slug === 'rent' ? 'SHARE' : 'REFUND' },
      });
    }
    await this.closeRequestsFor(userId, merchant.merchantKey);
    return { updatedCount: res.count };
  }

  /** Change one payment only. Leaves the merchant's other payments (and any open request) alone. */
  async applyOnce(userId: string, transactionId: string, categoryId: string): Promise<UpdatedCountResponse> {
    const [tx, category] = await Promise.all([
      this.db.transaction.findFirst({ where: { id: transactionId, userId }, include: { merchant: true } }),
      this.db.category.findFirst({ where: { id: categoryId, userId, archived: false } }),
    ]);
    if (!tx) throw new NotFoundException('Transaction not found');
    if (!category) throw new BadRequestException('Unknown category');
    await this.db.transaction.update({
      where: { id: tx.id },
      data: { categoryId, categorisedBy: 'USER', needsReview: false },
    });
    if (tx.merchant) await this.repointOrCloseRequest(userId, tx.merchant.merchantKey, tx.merchant.id, tx.id);
    return { updatedCount: 1 };
  }

  private async repointOrCloseRequest(userId: string, merchantKey: string, merchantId: string, answeredTxId: string): Promise<void> {
    const open = await this.db.categorisationRequest.findFirst({ where: { userId, merchantKey, status: 'OPEN' } });
    if (!open) return;
    const next = await this.db.transaction.findFirst({
      where: { userId, merchantId, needsReview: true, id: { not: answeredTxId } },
      orderBy: { bookingDate: 'desc' },
    });
    if (next) await this.db.categorisationRequest.update({ where: { id: open.id }, data: { transactionId: next.id } });
    else await this.closeRequestsFor(userId, merchantKey);
  }

  async answer(userId: string, requestId: string, body: AnswerCategoriseBody): Promise<UpdatedCountResponse> {
    const req = await this.db.categorisationRequest.findFirst({ where: { id: requestId, userId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'OPEN') throw new BadRequestException('This request was already answered');
    if (body.scope === 'once') return this.applyOnce(userId, req.transactionId, body.categoryId);
    const merchant = await this.db.merchant.findUnique({ where: { userId_merchantKey: { userId, merchantKey: req.merchantKey } } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return this.applyToMerchant(userId, merchant.id, body.categoryId);
  }

  /* ------------------------------------------------------ notifications */

  private askPayload(
    r: { id: string; merchantKey: string; askGroup: AskGroup },
    name: string,
    amount: string,
  ) {
    return {
      kind: 'categorise' as const,
      title: 'What was this payment?',
      body: `${eur(Math.abs(Number(amount)))} at ${name} — what was it?`,
      ...(r.askGroup === 'OTHER' ? {} : { categoryIdentifier: askCategoryId(r.askGroup) }),
      data: { requestId: r.id, merchantKey: r.merchantKey, askGroup: r.askGroup },
    };
  }

  /**
   * Push one notification per open request that has not been announced yet. More than five open requests
   * means the evening digest takes over instead. Skipped requests during quiet hours stay un-notified.
   */
  async notifyOpenRequests(userId: string, now = new Date()): Promise<number> {
    const open = await this.db.categorisationRequest.findMany({ where: { userId, status: 'OPEN' } });
    if (open.length === 0 || open.length > MAX_INDIVIDUAL_PUSHES) return 0;
    const fresh = open.filter((r) => !r.notifiedAt);
    let sent = 0;
    for (const r of fresh) {
      const tx = await this.db.transaction.findUnique({ where: { id: r.transactionId }, include: { merchant: true } });
      if (!tx) continue;
      const res = await this.push.send(
        userId,
        this.askPayload(r, tx.merchant?.displayName ?? tx.rawDescriptor, tx.amountEur.toString()),
        { respectQuietHours: true, now },
      );
      if (res.deferred) break;
      await this.db.categorisationRequest.update({ where: { id: r.id }, data: { notifiedAt: new Date() } });
      sent++;
    }
    return sent;
  }

  /** One summary push when many requests are waiting. */
  async sendDigest(userId: string, now = new Date()): Promise<boolean> {
    const open = await this.db.categorisationRequest.findMany({ where: { userId, status: 'OPEN' } });
    if (open.length === 0) return false;
    if (open.length <= MAX_INDIVIDUAL_PUSHES) {
      await this.notifyOpenRequests(userId, now);
      return false;
    }
    const res = await this.push.send(
      userId,
      {
        kind: 'digest',
        title: `${open.length} payments need a category`,
        body: 'Open Finally to sort them. Each answer covers every payment from that merchant.',
        data: { screen: 'sort' },
      },
      { respectQuietHours: true, now },
    );
    if (res.deferred) return false;
    await this.db.categorisationRequest.updateMany({ where: { id: { in: open.map((r) => r.id) } }, data: { notifiedAt: new Date() } });
    return true;
  }

}
