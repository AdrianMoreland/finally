import { Module } from '@nestjs/common';
import { AskModule } from '../ask/ask.module';
import { CategorisationModule } from '../categorisation/categorisation.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [AskModule, CategorisationModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
