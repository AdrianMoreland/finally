import { Module } from '@nestjs/common';
import { PeopleModule } from '../people/people.module';
import { PotsController } from './pots.controller';
import { PotsService } from './pots.service';

@Module({ imports: [PeopleModule], controllers: [PotsController], providers: [PotsService], exports: [PotsService] })
export class PotsModule {}
