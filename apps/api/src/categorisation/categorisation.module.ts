import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiSuggestService } from './ai-suggest.service';
import { CategorisationController } from './categorisation.controller';
import { CategorisationService } from './categorisation.service';

@Module({
  imports: [NotificationsModule],
  controllers: [CategorisationController],
  providers: [CategorisationService, AiSuggestService],
  exports: [CategorisationService],
})
export class CategorisationModule {}
