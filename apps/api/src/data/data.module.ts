import { Global, Module } from '@nestjs/common';
import { FinanceDataService } from './finance-data.service';
import { LedgerService } from './ledger.service';

@Global()
@Module({ providers: [FinanceDataService, LedgerService], exports: [FinanceDataService, LedgerService] })
export class DataModule {}
