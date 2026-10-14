export type RuleMatchType = 'EXACT' | 'CONTAINS' | 'REGEX';

export interface CoreRule {
  id: string;
  matchType: RuleMatchType;
  pattern: string;
  categoryId: string;
  /** Higher wins within the same source. */
  priority: number;
  source: 'USER' | 'SEED';
  active: boolean;
}

export interface RuleTarget {
  merchantKey: string;
  rawDescriptor: string;
}

const specificity: Record<RuleMatchType, number> = { EXACT: 3, CONTAINS: 2, REGEX: 1 };

/** USER rules before SEED; then higher priority; then more specific match; then longer pattern. */
export function sortRules(rules: readonly CoreRule[]): CoreRule[] {
  return rules
    .filter((r) => r.active)
    .sort(
      (a, b) =>
        (a.source === b.source ? 0 : a.source === 'USER' ? -1 : 1) ||
        b.priority - a.priority ||
        specificity[b.matchType] - specificity[a.matchType] ||
        b.pattern.length - a.pattern.length ||
        a.id.localeCompare(b.id),
    );
}

const regexCache = new Map<string, RegExp | null>();
function compile(pattern: string): RegExp | null {
  if (!regexCache.has(pattern)) {
    try {
      regexCache.set(pattern, new RegExp(pattern, 'i'));
    } catch {
      regexCache.set(pattern, null);
    }
  }
  return regexCache.get(pattern) ?? null;
}

export function ruleMatches(rule: CoreRule, tx: RuleTarget): boolean {
  switch (rule.matchType) {
    case 'EXACT':
      return tx.merchantKey === rule.pattern.toLowerCase();
    case 'CONTAINS':
      return tx.rawDescriptor.toLowerCase().includes(rule.pattern.toLowerCase());
    case 'REGEX': {
      const re = compile(rule.pattern);
      return re ? re.test(tx.rawDescriptor) : false;
    }
  }
}

/**
 * Pick the winning rule for a transaction, or null. EXACT matches merchantKey; CONTAINS and REGEX match the
 * raw descriptor. Inactive rules are ignored. Pass the rules in any order.
 */
export function applyRules(tx: RuleTarget, rules: readonly CoreRule[]): CoreRule | null {
  for (const rule of sortRules(rules)) {
    if (ruleMatches(rule, tx)) return rule;
  }
  return null;
}
