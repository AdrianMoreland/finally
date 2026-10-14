import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { CreateGoalDto, GoalDto, GoalListDto, OkDto, UpdateGoalDto } from '../common/dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { GoalsService } from './goals.service';

@ApiTags('goals')
@ApiBearerAuth()
@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  @ZodSerializerDto(GoalListDto)
  list(@CurrentUser() user: AuthUser) {
    return this.goals.list(user.id);
  }

  @Post()
  @ZodSerializerDto(GoalDto)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateGoalDto) {
    return this.goals.create(user.id, body);
  }

  @Patch(':id')
  @ZodSerializerDto(GoalDto)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateGoalDto) {
    return this.goals.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  @ZodSerializerDto(OkDto)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.goals.remove(user.id, id);
    return { ok: true as const };
  }
}
