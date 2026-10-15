import { Module } from '@nestjs/common';
import { ActionsModule } from '../actions/actions.module';
import { AskModule } from '../ask/ask.module';
import { BankingModule } from '../banking/banking.module';
import { PotsModule } from '../pots/pots.module';
import { TodayController } from './today.controller';
import { TodayService } from './today.service';

@Module({ imports: [ActionsModule, AskModule, BankingModule, PotsModule], controllers: [TodayController], providers: [TodayService], exports: [TodayService] })
export class TodayModule {}
