import { Global, Module } from '@nestjs/common';
import { FxService } from './fx.service';
import { MarketDataService } from './market-data.service';

@Global()
@Module({ providers: [FxService, MarketDataService], exports: [FxService, MarketDataService] })
export class MarketDataModule {}
