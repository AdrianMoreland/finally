import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { dublinDate, monthOf } from '@finally/finance-core';
import { BudgetsDto, BudgetsQueryDto, UpsertBudgetDto } from '../common/dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { BudgetsService } from './budgets.service';

@ApiTags('budgets')
@ApiBearerAuth()
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  @ZodSerializerDto(BudgetsDto)
  get(@CurrentUser() user: AuthUser, @Query() q: BudgetsQueryDto) {
    return this.budgets.rows(user.id, q.month ?? monthOf(dublinDate(new Date())));
  }

  @Put()
  @ZodSerializerDto(BudgetsDto)
  upsert(@CurrentUser() user: AuthUser, @Body() body: UpsertBudgetDto) {
    return this.budgets.upsert(user.id, body);
  }

  @Delete(':categoryId')
  @ZodSerializerDto(BudgetsDto)
  remove(@CurrentUser() user: AuthUser, @Param('categoryId') categoryId: string, @Query() q: BudgetsQueryDto) {
    return this.budgets.remove(user.id, categoryId, q.month ?? monthOf(dublinDate(new Date())));
  }
}
