import { Module } from '@nestjs/common';
import { PeopleModule } from '../people/people.module';
import { PlanModule } from '../plan/plan.module';
import { PotsModule } from '../pots/pots.module';
import { TaxModule } from '../tax/tax.module';
import { ActionsService } from './actions.service';

@Module({ imports: [PeopleModule, PlanModule, PotsModule, TaxModule], providers: [ActionsService], exports: [ActionsService] })
export class ActionsModule {}
