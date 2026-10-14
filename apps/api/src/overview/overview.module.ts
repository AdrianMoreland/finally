import { Module } from '@nestjs/common';
import { BankingModule } from '../banking/banking.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { InsightsModule } from '../insights/insights.module';
import { InvestmentsModule } from '../investments/investments.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';

@Module({
  imports: [BankingModule, BudgetsModule, InsightsModule, InvestmentsModule, TransactionsModule],
  controllers: [OverviewController],
  providers: [OverviewService],
  exports: [OverviewService],
})
export class OverviewModule {}
