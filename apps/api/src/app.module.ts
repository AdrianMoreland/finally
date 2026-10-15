import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { ActionsModule } from './actions/actions.module';
import { AskModule } from './ask/ask.module';
import { AuthModule } from './auth/auth.module';
import { BankingModule } from './banking/banking.module';
import { BudgetsModule } from './budgets/budgets.module';
import { CategoriesModule } from './categories/categories.module';
import { CategorisationModule } from './categorisation/categorisation.module';
import { REDACT_PATHS, scrub } from './common/redact';
import { DataModule } from './data/data.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health/health.controller';
import { GrowModule } from './grow/grow.module';
import { InsightsModule } from './insights/insights.module';
import { InvestmentsModule } from './investments/investments.module';
import { JobsModule } from './jobs/jobs.module';
import { MarketDataModule } from './market-data/market-data.module';
import { MeModule } from './me/me.module';
import { MoneyModule } from './money/money.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OverviewModule } from './overview/overview.module';
import { PeopleModule } from './people/people.module';
import { PlanModule } from './plan/plan.module';
import { PotsModule } from './pots/pots.module';
import { SetupModule } from './setup/setup.module';
import { SnapshotModule } from './snapshot/snapshot.module';
import { TaxModule } from './tax/tax.module';
import { TodayModule } from './today/today.module';
import { ToolsModule } from './tools/tools.module';
import { TransactionsModule } from './transactions/transactions.module';

const sentry: DynamicModule[] = process.env['SENTRY_DSN'] ? [SentryModule.forRoot()] : [];

@Module({
  imports: [
    ...sentry,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['NODE_ENV'] === 'test' ? 'silent' : (process.env['LOG_LEVEL'] ?? 'info'),
        redact: { paths: REDACT_PATHS, censor: '[redacted]' },
        formatters: { log: (obj) => scrub(obj) },
        autoLogging: { ignore: (req) => req.url === '/health' },
        serializers: {
          req: (req: { method: string; url: string; id: string }) => ({ id: req.id, method: req.method, url: req.url.split('?')[0] }),
        },
        ...(process.env['NODE_ENV'] === 'production'
          ? {}
          : { transport: { target: 'pino-pretty', options: { singleLine: true, colorize: true } } }),
      },
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 180 }]),
    ScheduleModule.forRoot(),
    DbModule,
    JobsModule,
    DataModule,
    MarketDataModule,
    NotificationsModule,
    CategorisationModule,
    BankingModule,
    BudgetsModule,
    InsightsModule,
    InvestmentsModule,
    TransactionsModule,
    CategoriesModule,
    SnapshotModule,
    PeopleModule,
    PotsModule,
    PlanModule,
    TaxModule,
    ActionsModule,
    AskModule,
    TodayModule,
    MoneyModule,
    GrowModule,
    SetupModule,
    OverviewModule,
    MeModule,
    ToolsModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    ...(process.env['SENTRY_DSN'] ? [{ provide: APP_FILTER, useClass: SentryGlobalFilter }] : []),
  ],
})
export class AppModule {}
