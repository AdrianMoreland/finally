import { Module } from '@nestjs/common';
import { ENV, type Env } from '../common/env';
import { InsightsModule } from '../insights/insights.module';
import { BankingController } from './banking.controller';
import { BankingService } from './banking.service';
import { IngestService } from './ingest.service';
import { BANK_PROVIDER, type BankDataProvider } from './providers/bank-provider';
import { MockBankProvider } from './providers/mock-bank.provider';

@Module({
  imports: [InsightsModule],
  controllers: [BankingController],
  providers: [
    IngestService,
    BankingService,
    MockBankProvider,
    {
      provide: BANK_PROVIDER,
      inject: [ENV, MockBankProvider],
      useFactory: (env: Env, mock: MockBankProvider): BankDataProvider => {
        if (env.BANK_PROVIDER === 'enable_banking') {
          throw new Error('BANK_PROVIDER=enable_banking is not wired yet');
        }
        return mock;
      },
    },
  ],
  exports: [BankingService, IngestService],
})
export class BankingModule {}
