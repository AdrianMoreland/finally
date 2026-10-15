import { Module } from '@nestjs/common';
import { PotsModule } from '../pots/pots.module';
import { TaxModule } from '../tax/tax.module';
import { GrowController } from './grow.controller';
import { GrowService } from './grow.service';

@Module({ imports: [PotsModule, TaxModule], controllers: [GrowController], providers: [GrowService], exports: [GrowService] })
export class GrowModule {}
