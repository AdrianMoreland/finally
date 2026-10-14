import { Inject, Injectable, Logger } from '@nestjs/common';
import { provisionDemoPortfolio, type Db } from '@finally/db';
import { addDays, dublinDate, monthOf, m2 } from '@finally/finance-core';
import { BankingService } from '../banking/banking.service';
import { BudgetsService } from '../budgets/budgets.service';
import { CategorisationService } from '../categorisation/categorisation.service';
import { ENV, type Env } from '../common/env';
import { InjectDb } from '../common/tokens';
import { InsightsService } from '../insights/insights.service';
import { MarketDataService } from '../market-data/market-data.service';

/** Starting budgets for the demo data: month totals chosen to match the design prototype. */
const DEMO_BUDGETS: Record<string, string> = {
  rent: '1100', groceries: '320', 'eating-out': '180', coffee: '60', transport: '90',
  bills: '250', shopping: '150', subscriptions: '55', fun: '120',
};

/**
 * First sign-in with `BANK_PROVIDER=mock`: link the mock banks, run the full pipeline once and add demo budgets,
 * goals and investments, so every screen has real numbers without any third-party keys.
 */
@Injectable()
export class OnboardingService {
  private readonly log = new Logger(OnboardingService.name);
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly done = new Set<string>();

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly banking: BankingService,
    private readonly categorisation: CategorisationService,
    private readonly insights: InsightsService,
    private readonly budgets: BudgetsService,
    private readonly market: MarketDataService,
  ) {}

  async ensureOnboarded(userId: string): Promise<void> {
    if (this.done.has(userId)) return;
    let p = this.inflight.get(userId);
    if (!p) {
      p = this.run(userId).finally(() => {
        this.inflight.delete(userId);
        this.done.add(userId);
      });
      this.inflight.set(userId, p);
    }
    await p;
  }

  private async run(userId: string): Promise<void> {
    if (this.env.BANK_PROVIDER !== 'mock') return;
    // Every step checks its own state, so a restart half way through simply carries on.
    if ((await this.db.bankConnection.count({ where: { userId, sessionIdEnc: { not: null } } })) === 0) {
      this.log.log('Onboarding with mock banks');
      await this.banking.connectAndSync(userId, 'AIB');
      await this.banking.connectAndSync(userId, 'REVOLUT');
    }
    await this.categorisation.categoriseUser(userId);
    await this.seedBudgets(userId);
    await this.seedGoals(userId);
    await provisionDemoPortfolio(this.db, userId);
    await this.db.user.updateMany({ where: { id: userId, monthlySavingsTarget: 0 }, data: { monthlySavingsTarget: m2(630) } });
    for (const i of await this.db.instrument.findMany({ where: { userId } })) {
      if ((await this.db.priceBar.count({ where: { instrumentId: i.id } })) === 0) await this.market.backfill(userId, i.id);
    }
    if ((await this.db.insight.count({ where: { userId } })) === 0) await this.insights.runForUser(userId);
  }

  private async seedBudgets(userId: string): Promise<void> {
    const month = monthOf(dublinDate(new Date()));
    if ((await this.db.budget.count({ where: { userId } })) > 0) return;
    const cats = await this.db.category.findMany({ where: { userId, slug: { in: Object.keys(DEMO_BUDGETS) } } });
    const months = [month, monthOf(addDays(`${month}-01`, -1))];
    await this.db.budget.createMany({
      data: months.flatMap((m) => cats.map((c) => ({ userId, categoryId: c.id, month: m, amount: DEMO_BUDGETS[c.slug]! }))),
      skipDuplicates: true,
    });
  }

  private async seedGoals(userId: string): Promise<void> {
    if ((await this.db.goal.count({ where: { userId } })) > 0) return;
    const accounts = await this.db.account.findMany({ where: { userId } });
    const rainy = accounts.find((a) => a.name.startsWith('Rainy'));
    const summer = accounts.find((a) => a.name.startsWith('Summer'));
    await this.db.goal.createMany({
      data: [
        { userId, name: 'Rainy day fund', target: '5000.00', targetDate: new Date('2027-06-30T00:00:00Z'), accountId: rainy?.id ?? null, saved: '0' },
        { userId, name: 'Summer trip', target: '1500.00', targetDate: new Date('2027-06-01T00:00:00Z'), accountId: summer?.id ?? null, saved: '0' },
      ],
    });
  }
}
