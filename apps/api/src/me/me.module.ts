import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CategorisationModule } from '../categorisation/categorisation.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({ imports: [AuthModule, CategorisationModule], controllers: [MeController], providers: [MeService], exports: [MeService] })
export class MeModule {}
