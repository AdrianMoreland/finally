import { Inject, Injectable, Logger } from '@nestjs/common';
import { provisionDemoStatement, type Db } from '@finally/db';
import { BankingService } from '../banking/banking.service';
import { CategorisationService } from '../categorisation/categorisation.service';
import { ENV, type Env } from '../common/env';
import { InjectDb } from '../common/tokens';
import { InsightsService } from '../insights/insights.service';
import { SetupService } from '../setup/setup.service';

/**
 * First sign-in with `BANK_PROVIDER=mock`: link the mock AIB account (the owner's real statement, brought up to date with
 * generated payments), run the full pipeline once and add starting budgets, pots and people, so every screen has real
 * numbers without any third-party keys.
 */
@Injectable()
export class OnboardingService {
  private readonly log = new Logger(OnboardingService.name);
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly done = new Set<string>();
  /** Bumped on reset, so a run that was in flight cannot mark a reset user as onboarded. */
  private readonly generation = new Map<string, number>();

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly banking: BankingService,
    private readonly categorisation: CategorisationService,
    private readonly insights: InsightsService,
    private readonly setup: SetupService,
  ) {}

  /** Forget that this user was onboarded: the next request sets them up again, like someone who just signed up. */
  reset(userId: string): void {
    this.generation.set(userId, (this.generation.get(userId) ?? 0) + 1);
    this.done.delete(userId);
    this.inflight.delete(userId);
  }

  async ensureOnboarded(userId: string): Promise<void> {
    if (this.done.has(userId)) return;
    let p = this.inflight.get(userId);
    if (!p) {
      const gen = this.generation.get(userId) ?? 0;
      const run: Promise<void> = this.run(userId)
        .then(() => {
          // Only a successful run on the current generation counts; a failed one is retried on the next request.
          if ((this.generation.get(userId) ?? 0) === gen) this.done.add(userId);
        })
        .finally(() => {
          if (this.inflight.get(userId) === run) this.inflight.delete(userId);
        });
      p = run;
      this.inflight.set(userId, p);
    }
    await p;
  }

  private async run(userId: string): Promise<void> {
    if (this.env.BANK_PROVIDER !== 'mock') return;
    // Every step checks its own state, so a restart half way through simply carries on.
    if ((await this.db.bankConnection.count({ where: { userId, sessionIdEnc: { not: null } } })) === 0) {
      this.log.log('Onboarding with the mock AIB account');
      await provisionDemoStatement(this.db, userId);
      await this.banking.connectAndSync(userId, 'AIB');
    }
    await this.categorisation.categoriseUser(userId);
    await this.setup.applyDemoDefaults(userId);
    if ((await this.db.insight.count({ where: { userId } })) === 0) await this.insights.runForUser(userId);
  }
}
