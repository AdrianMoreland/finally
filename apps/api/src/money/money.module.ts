import { Module } from '@nestjs/common';
import { ActionsModule } from '../actions/actions.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { CategorisationModule } from '../categorisation/categorisation.module';
import { BillsService } from './bills.service';
import { MoneyController } from './bills.controller';
import { CashflowService } from './cashflow.service';
import { MonthService } from './month.service';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { SpendingService } from './spending.service';

@Module({
  imports: [ActionsModule, BudgetsModule, CategorisationModule],
  controllers: [MoneyController, ReviewController],
  providers: [BillsService, CashflowService, MonthService, ReviewService, SpendingService],
  exports: [BillsService, CashflowService, MonthService, ReviewService],
})
export class MoneyModule {}
