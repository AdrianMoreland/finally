import { Module } from '@nestjs/common';
import { PeopleModule } from '../people/people.module';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';

@Module({ imports: [PeopleModule], controllers: [PlanController], providers: [PlanService], exports: [PlanService] })
export class PlanModule {}
