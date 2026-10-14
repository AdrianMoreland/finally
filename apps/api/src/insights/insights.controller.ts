import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { InsightsDto, OkDto, RecurringListDto } from '../common/dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { InsightsService } from './insights.service';

@ApiTags('insights')
@ApiBearerAuth()
@Controller()
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('insights')
  @ZodSerializerDto(InsightsDto)
  list(@CurrentUser() user: AuthUser) {
    return this.insights.list(user.id);
  }

  /** Recompute now (also runs after every sync and nightly). */
  @Post('insights/refresh')
  @HttpCode(200)
  @ZodSerializerDto(InsightsDto)
  async refresh(@CurrentUser() user: AuthUser) {
    await this.insights.runForUser(user.id);
    return this.insights.list(user.id);
  }

  @Post('insights/:id/seen')
  @HttpCode(200)
  @ZodSerializerDto(OkDto)
  async seen(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.insights.markSeen(user.id, id);
    return { ok: true as const };
  }

  @Get('recurring')
  @ZodSerializerDto(RecurringListDto)
  recurring(@CurrentUser() user: AuthUser) {
    return this.insights.recurring(user.id);
  }
}
