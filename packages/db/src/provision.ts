import { normaliseMerchant } from '@finally/finance-core';
import type { PrismaClient } from './generated/client.ts';
import {
  DEMO_INSTRUMENTS,
  DEMO_LOTS,
  DEMO_TARGET_ALLOCATION,
  SEED_CATEGORIES,
  SEED_MERCHANTS,
  SEED_PATTERN_RULES,
  SEED_TAX_RULES,
} from './seed-data.ts';

export interface ProvisionResult {
  categories: number;
  rules: number;
  taxRules: number;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whole-word descriptor pattern for a merchant ("boots-pharmacy" → \bboots[\s*.-]+pharmacy\b), so a rule
 * still matches when the bank adds a store name or suburb. Skipped for very short or punctuated names where it
 * would over-match; those rely on the exact merchant key.
 */
export function wordPattern(merchantKey: string, name: string): string | null {
  if (/[^A-Za-z0-9 ]/.test(name)) return null;
  const tokens = merchantKey.split('-').filter(Boolean);
  if (tokens.length === 0 || (tokens.length === 1 && merchantKey.length < 5)) return null;
  return `\\b${tokens.map(escapeRe).join('[\\s*.-]+')}\\b`;
}

/** Idempotently create a user's categories, SEED merchant rules and tax rules. Safe to run on every login. */
export async function provisionDefaults(db: PrismaClient, userId: string): Promise<ProvisionResult> {
  const bySlug = new Map<string, string>();
  const ordered = [...SEED_CATEGORIES].sort((a, b) => Number(Boolean(a.parent)) - Number(Boolean(b.parent)));
  let sortOrder = 0;
  for (const c of ordered) {
    const parentId = c.parent ? (bySlug.get(c.parent) ?? null) : null;
    const row = await db.category.upsert({
      where: { userId_slug: { userId, slug: c.slug } },
      update: {},
      create: {
        userId,
        slug: c.slug,
        name: c.name,
        group: c.group,
        askGroup: c.askGroup,
        icon: c.icon,
        colour: c.colour,
        parentId,
        sortOrder: sortOrder++,
      },
    });
    bySlug.set(c.slug, row.id);
  }

  const rules: Array<{
    userId: string;
    matchType: 'EXACT' | 'REGEX' | 'CONTAINS';
    pattern: string;
    categoryId: string;
    priority: number;
    source: 'SEED';
    active: boolean;
  }> = [];
  const seen = new Set<string>();
  for (const [slug, names] of Object.entries(SEED_MERCHANTS)) {
    const categoryId = bySlug.get(slug);
    if (!categoryId) continue;
    for (const name of names) {
      const { merchantKey } = normaliseMerchant(name);
      if (seen.has(merchantKey)) continue;
      seen.add(merchantKey);
      rules.push({ userId, matchType: 'EXACT', pattern: merchantKey, categoryId, priority: 100, source: 'SEED', active: true });
      const rx = wordPattern(merchantKey, name);
      if (rx && !seen.has(`rx:${rx}`)) {
        seen.add(`rx:${rx}`);
        rules.push({ userId, matchType: 'REGEX', pattern: rx, categoryId, priority: 100, source: 'SEED', active: true });
      }
    }
  }
  for (const r of SEED_PATTERN_RULES) {
    const categoryId = bySlug.get(r.slug);
    if (categoryId) rules.push({ userId, matchType: r.matchType, pattern: r.pattern, categoryId, priority: 90, source: 'SEED', active: true });
  }
  const created = await db.merchantRule.createMany({ data: rules, skipDuplicates: true });

  let taxRules = 0;
  if ((await db.taxRule.count({ where: { userId } })) === 0) {
    const res = await db.taxRule.createMany({
      data: SEED_TAX_RULES.map((r) => ({
        userId,
        regime: r.regime,
        rate: r.rate,
        annualExemption: r.annualExemption ?? null,
        threshold: r.threshold ?? null,
        contributionCap: r.contributionCap ?? null,
        effectiveFrom: new Date(`${r.effectiveFrom}T00:00:00Z`),
        effectiveTo: r.effectiveTo ? new Date(`${r.effectiveTo}T00:00:00Z`) : null,
      })),
    });
    taxRules = res.count;
  }
  return { categories: bySlug.size, rules: created.count, taxRules };
}

/** Demo investments (mirrors the design prototype). Only runs when the user has no instruments yet. */
export async function provisionDemoPortfolio(db: PrismaClient, userId: string): Promise<number> {
  if ((await db.instrument.count({ where: { userId } })) > 0) return 0;
  const ids = new Map<string, string>();
  for (const i of DEMO_INSTRUMENTS) {
    const row = await db.instrument.create({
      data: {
        userId,
        symbol: i.symbol,
        isin: i.isin,
        exchange: i.exchange,
        name: i.name,
        assetClass: i.assetClass,
        taxRegime: i.taxRegime,
        currency: 'EUR',
      },
    });
    ids.set(i.symbol, row.id);
  }
  for (const l of DEMO_LOTS) {
    await db.lot.create({
      data: {
        userId,
        instrumentId: ids.get(l.symbol)!,
        acquiredAt: new Date(`${l.acquiredAt}T00:00:00Z`),
        quantity: l.quantity,
        unitCost: l.unitCost,
        fees: '0',
        wrapper: 'BROKER',
      },
    });
  }
  await db.user.update({ where: { id: userId }, data: { targetAllocation: DEMO_TARGET_ALLOCATION } });
  return DEMO_LOTS.length;
}
