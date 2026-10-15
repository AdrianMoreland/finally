import { Module } from '@nestjs/common';
import { ActionsModule } from '../actions/actions.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { CategorisationModule } from '../categorisation/categorisation.module';
import { BillsService } from './bills.service';
import { MoneyController } from './bills.controller';
import { MonthService } from './month.service';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  imports: [ActionsModule, BudgetsModule, CategorisationModule],
  controllers: [MoneyController, ReviewController],
  providers: [BillsService, MonthService, ReviewService],
  exports: [BillsService, MonthService, ReviewService],
})
export class MoneyModule {}
