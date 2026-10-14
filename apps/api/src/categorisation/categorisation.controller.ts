import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { AnswerCategoriseDto, CategoriseQueueDto, UpdatedCountDto } from '../common/dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { CategorisationService } from './categorisation.service';

@ApiTags('categorise')
@ApiBearerAuth()
@Controller('categorise')
export class CategorisationController {
  constructor(private readonly service: CategorisationService) {}

  /** Inbox of merchants waiting for a category. */
  @Get('queue')
  @ZodSerializerDto(CategoriseQueueDto)
  queue(@CurrentUser() user: AuthUser) {
    return this.service.queue(user.id);
  }

  /** Answer a request: `merchant` scope remembers the merchant, `once` changes only that payment. */
  @Post(':requestId')
  @ZodSerializerDto(UpdatedCountDto)
  answer(@CurrentUser() user: AuthUser, @Param('requestId') requestId: string, @Body() body: AnswerCategoriseDto) {
    return this.service.answer(user.id, requestId, body);
  }
}
