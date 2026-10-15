import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { budgetSuggestions } from '@finally/finance-core';
import { ZodSerializerDto } from 'nestjs-zod';
import { BillsDto, CancelRepeatingDto, DismissDto, MonthDto } from '../common/app-dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { SnapshotService } from '../snapshot/snapshot.service';
import { BillsService } from './bills.service';
import { MonthService } from './month.service';

@ApiTags('money')
@ApiBearerAuth()
@Controller()
export class MoneyController {
  constructor(
    private readonly bills: BillsService,
    private readonly month: MonthService,
    private readonly snapshot: SnapshotService,
  ) {}

  /** Repeating payments found from history, what is due before payday, refunds and double charges. */
  @Get('bills')
  @ZodSerializerDto(BillsDto)
  getBills(@CurrentUser() user: AuthUser) {
    return this.bills.get(user.id);
  }

  @Post('bills/cancel')
  @ZodSerializerDto(BillsDto)
  cancel(@CurrentUser() user: AuthUser, @Body() body: CancelRepeatingDto) {
    return this.bills.cancel(user.id, body.id, body.cancelled);
  }

  @Post('bills/dismiss')
  @ZodSerializerDto(BillsDto)
  dismiss(@CurrentUser() user: AuthUser, @Body() body: DismissDto) {
    return this.bills.dismiss(user.id, body.id);
  }

  /** Budgets worth starting from: the middle of the last three months, rounded up to the next €5. */
  @Get('budgets/suggestions')
  async suggestions(@CurrentUser() user: AuthUser) {
    const s = await this.snapshot.get(user.id);
    return budgetSuggestions(s.txs, s.today);
  }

  /** On-track chart, spent vs budget, net worth and a few things worth knowing. */
  @Get('month')
  @ZodSerializerDto(MonthDto)
  getMonth(@CurrentUser() user: AuthUser) {
    return this.month.get(user.id);
  }
}
