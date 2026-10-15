import { Module } from '@nestjs/common';
import { PeopleModule } from '../people/people.module';
import { PotsModule } from '../pots/pots.module';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';

@Module({ imports: [PeopleModule, PotsModule], controllers: [AskController], providers: [AskService], exports: [AskService] })
export class AskModule {}
