import { z } from 'zod';

export const bankProviderKind = z.enum(['ENABLE_BANKING', 'MOCK']);
export const institution = z.enum(['AIB', 'REVOLUT']);
export const connectionStatus = z.enum(['ACTIVE', 'EXPIRING', 'EXPIRED', 'ERROR']);
export const accountType = z.enum(['CURRENT', 'SAVINGS', 'VAULT', 'CARD']);
export const txStatus = z.enum(['PENDING', 'BOOKED']);
export const txKind = z.enum(['SPEND', 'INCOME', 'TRANSFER', 'REFUND', 'SHARE']);
export const categorisedBy = z.enum(['RULE', 'USER', 'SEED', 'AI', 'NONE']);
export const categoryGroup = z.enum(['ESSENTIALS', 'LIFESTYLE', 'SAVINGS', 'INCOME', 'TRANSFER']);
export const askGroup = z.enum(['FOOD', 'TRANSPORT', 'SHOPPING', 'BILLS', 'FUN', 'OTHER']);
export const ruleMatchType = z.enum(['EXACT', 'CONTAINS', 'REGEX']);
export const ruleSource = z.enum(['USER', 'SEED']);
export const requestStatus = z.enum(['OPEN', 'ANSWERED', 'DISMISSED']);
export const cadence = z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']);
export const severity = z.enum(['INFO', 'WATCH', 'ACT']);
export const assetClass = z.enum(['ETF', 'SHARE', 'CRYPTO', 'METAL', 'CASH', 'PENSION']);
export const taxRegime = z.enum(['EXIT_TAX', 'CGT', 'NONE']);
export const taxRuleRegime = z.enum(['EXIT_TAX', 'CGT', 'INVESTMENT_ACCOUNT']);
export const wrapper = z.enum(['BROKER', 'INVESTMENT_ACCOUNT', 'PENSION']);
export const platform = z.enum(['IOS', 'ANDROID', 'WEB']);
export const potType = z.enum(['SAFETY', 'PLANNED', 'TREAT', 'INVESTING']);
export const personDirection = z.enum(['OWE', 'OWED']);
export const reviewKind = z.enum(['WEEK', 'MONTH']);
export const checkState = z.enum(['TODO', 'DONE', 'NA']);

export type BankProviderKind = z.infer<typeof bankProviderKind>;
export type Institution = z.infer<typeof institution>;
export type ConnectionStatus = z.infer<typeof connectionStatus>;
export type AccountType = z.infer<typeof accountType>;
export type TxStatus = z.infer<typeof txStatus>;
export type TxKind = z.infer<typeof txKind>;
export type CategorisedBy = z.infer<typeof categorisedBy>;
export type CategoryGroup = z.infer<typeof categoryGroup>;
export type AskGroup = z.infer<typeof askGroup>;
export type RuleMatchType = z.infer<typeof ruleMatchType>;
export type RuleSource = z.infer<typeof ruleSource>;
export type RequestStatus = z.infer<typeof requestStatus>;
export type Cadence = z.infer<typeof cadence>;
export type Severity = z.infer<typeof severity>;
export type AssetClass = z.infer<typeof assetClass>;
export type TaxRegime = z.infer<typeof taxRegime>;
export type TaxRuleRegime = z.infer<typeof taxRuleRegime>;
export type Wrapper = z.infer<typeof wrapper>;
export type Platform = z.infer<typeof platform>;
export type PotType = z.infer<typeof potType>;
export type PersonDirection = z.infer<typeof personDirection>;
export type ReviewKind = z.infer<typeof reviewKind>;
export type CheckState = z.infer<typeof checkState>;

/**
 * The three quick-answer categories offered per askGroup (category slugs). Used for push notification
 * buttons, To-sort cards and the AI fallback. `OTHER` has no buttons.
 */
export const ASK_GROUP_BUTTONS: Record<AskGroup, readonly string[]> = {
  FOOD: ['coffee', 'eating-out', 'groceries'],
  TRANSPORT: ['taxi', 'public-transport', 'fuel'],
  SHOPPING: ['shopping', 'household', 'gifts'],
  BILLS: ['bills', 'subscriptions', 'health'],
  FUN: ['bars', 'fun', 'eating-out'],
  OTHER: [],
};

/** iOS notification category identifier for an askGroup, e.g. `ask_food`. */
export const askCategoryId = (group: AskGroup): string => `ask_${group.toLowerCase()}`;

/** Slugs treated as fixed bills (paid on a schedule) for safe-to-spend and budget pacing. */
export const FIXED_CATEGORY_SLUGS: readonly string[] = ['rent', 'bills', 'subscriptions'];
