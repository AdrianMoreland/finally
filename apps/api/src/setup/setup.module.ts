import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { PotsModule } from '../pots/pots.module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

@Module({ imports: [BudgetsModule, PotsModule], controllers: [SetupController], providers: [SetupService], exports: [SetupService] })
export class SetupModule {}
