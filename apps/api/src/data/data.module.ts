import { Global, Module } from '@nestjs/common';
import { FinanceDataService } from './finance-data.service';

@Global()
@Module({ providers: [FinanceDataService], exports: [FinanceDataService] })
export class DataModule {}
