import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { SnoozeDto, TodayDto } from '../common/app-dto';
import { OkDto } from '../common/dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { TodayService } from './today.service';

@ApiTags('today')
@ApiBearerAuth()
@Controller('today')
export class TodayController {
  constructor(private readonly today: TodayService) {}

  /** Safe to spend, the few things that need you, what changed, and the next rung of the ladder. */
  @Get()
  @ZodSerializerDto(TodayDto)
  get(@CurrentUser() user: AuthUser) {
    return this.today.get(user.id);
  }

  @Post('snooze')
  @HttpCode(200)
  @ZodSerializerDto(OkDto)
  async snooze(@CurrentUser() user: AuthUser, @Body() body: SnoozeDto) {
    await this.today.snooze(user.id, body.actionId);
    return { ok: true as const };
  }

  @Delete('snooze')
  @ZodSerializerDto(OkDto)
  async unsnooze(@CurrentUser() user: AuthUser) {
    await this.today.unsnoozeAll(user.id);
    return { ok: true as const };
  }
}
