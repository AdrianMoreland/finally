import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { ChooseMonthDto, CompleteWeekDto, MonthCloseDto, WeeklyReviewDto } from '../common/app-dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { ReviewService } from './review.service';

@ApiTags('review')
@ApiBearerAuth()
@Controller('review')
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @Get('week')
  @ZodSerializerDto(WeeklyReviewDto)
  week(@CurrentUser() user: AuthUser) {
    return this.review.week(user.id);
  }

  @Post('week')
  @ZodSerializerDto(WeeklyReviewDto)
  completeWeek(@CurrentUser() user: AuthUser, @Body() body: CompleteWeekDto) {
    return this.review.completeWeek(user.id, body.decision);
  }

  @Delete('week')
  @ZodSerializerDto(WeeklyReviewDto)
  reopenWeek(@CurrentUser() user: AuthUser) {
    return this.review.reopenWeek(user.id);
  }

  @Get('month')
  @ZodSerializerDto(MonthCloseDto)
  month(@CurrentUser() user: AuthUser) {
    return this.review.month(user.id);
  }

  @Post('month')
  @ZodSerializerDto(MonthCloseDto)
  chooseMonth(@CurrentUser() user: AuthUser, @Body() body: ChooseMonthDto) {
    return this.review.chooseMonth(user.id, body.value, body.label);
  }

  @Delete('month')
  @ZodSerializerDto(MonthCloseDto)
  reopenMonth(@CurrentUser() user: AuthUser) {
    return this.review.reopenMonth(user.id);
  }
}
