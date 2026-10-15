import { Module } from '@nestjs/common';
import { InvestmentsModule } from '../investments/investments.module';
import { ToolsController } from './tools.controller';

@Module({ imports: [InvestmentsModule], controllers: [ToolsController] })
export class ToolsModule {}
