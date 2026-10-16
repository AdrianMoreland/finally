import { Module } from '@nestjs/common';
import { ActionsModule } from '../actions/actions.module';
import { AskModule } from '../ask/ask.module';
import { BankingModule } from '../banking/banking.module';
import { MoneyModule } from '../money/money.module';
import { PeopleModule } from '../people/people.module';
import { PotsModule } from '../pots/pots.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { TodayController } from './today.controller';
import { TodayService } from './today.service';

@Module({ imports: [ActionsModule, AskModule, BankingModule, MoneyModule, PeopleModule, PotsModule, TransactionsModule], controllers: [TodayController], providers: [TodayService], exports: [TodayService] })
export class TodayModule {}
