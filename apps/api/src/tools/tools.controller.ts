import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { TAX_DISCLAIMER } from '@finally/contracts';
import {
  addMonths,
  compoundGrowth,
  D,
  dublinDate,
  emergencyFund,
  fireNumber,
  loanPayoff,
  m2,
  monthOf,
  sum,
  whereShouldItGo,
} from '@finally/finance-core';
import {
  CompoundDto,
  CompoundResponseDto,
  ConvertQueryDto,
  ConvertResponseDto,
  EmergencyFundDto,
  FireDto,
  FireResponseDto,
  LoanDto,
  LoanResponseDto,
  WhereDto,
  WhereResponseDto,
} from '../common/dto';
import { iso } from '../common/mappers';
import { CurrentUser, InjectDb, type AuthUser } from '../common/tokens';
import { FinanceDataService } from '../data/finance-data.service';
import { InvestmentsService } from '../investments/investments.service';
import { FxService } from '../market-data/fx.service';
import type { Db } from '@finally/db';

@ApiTags('tools')
@ApiBearerAuth()
@Controller('tools')
export class ToolsController {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly data: FinanceDataService,
    private readonly investments: InvestmentsService,
    private readonly fx: FxService,
  ) {}

  @Post('compound')
  @HttpCode(200)
  @ZodSerializerDto(CompoundResponseDto)
  compound(@Body() b: CompoundDto) {
    return compoundGrowth(m2(b.initial), m2(b.monthly), b.annualReturnPct, b.years);
  }

  /** Based on the user's actual essential spend over the last three full months, and their savings accounts. */
  @Get('emergency-fund')
  @ZodSerializerDto(EmergencyFundDto)
  async emergency(@CurrentUser() user: AuthUser) {
    const today = dublinDate(new Date());
    const months = [1, 2, 3].map((n) => addMonths(monthOf(today), -n));
    const cats = await this.data.categories(user.id);
    const essential = new Set(cats.filter((c) => c.group === 'ESSENTIALS').map((c) => c.id));
    const txs = await this.data.coreTxs(user.id, `${months[2]}-01`, `${months[0]}-31`);
    const perMonth = months.map((m) =>
      sum(
        txs
          .filter((t) => monthOf(t.date) === m && (t.kind === 'SPEND' || t.kind === 'REFUND') && t.categoryId && essential.has(t.categoryId))
          .map((t) => D(t.amountEur).neg()),
      ).toString(),
    );
    const accounts = await this.db.account.findMany({ where: { userId: user.id, type: { in: ['SAVINGS', 'VAULT'] }, includeInNetWorth: true } });
    const saved = sum(accounts.map((a) => a.balance.toString()));
    return emergencyFund(perMonth, m2(saved));
  }

  @Post('fire')
  @HttpCode(200)
  @ZodSerializerDto(FireResponseDto)
  fire(@Body() b: FireDto) {
    return fireNumber(m2(b.annualSpend), b.withdrawalRatePct, m2(b.currentPortfolio), m2(b.monthlyContribution), b.annualReturnPct);
  }

  @Post('loan')
  @HttpCode(200)
  @ZodSerializerDto(LoanResponseDto)
  loan(@Body() b: LoanDto) {
    return loanPayoff(m2(b.principal), b.annualRatePct, b.termYears, m2(b.monthlyOverpayment));
  }

  /** After-tax comparison of a broker ETF, the Investment Account and individual shares. */
  @Post('where-should-it-go')
  @HttpCode(200)
  @ZodSerializerDto(WhereResponseDto)
  async where(@CurrentUser() user: AuthUser, @Body() b: WhereDto) {
    const rules = await this.investments.taxRules(user.id);
    const res = whereShouldItGo({
      amount: m2(b.amount),
      years: b.years,
      annualReturnPct: b.annualReturnPct,
      startDate: b.startDate ?? dublinDate(new Date()),
      rules,
    });
    return { ...res, disclaimer: TAX_DISCLAIMER };
  }

  @Get('convert')
  @ZodSerializerDto(ConvertResponseDto)
  async convert(@Query() q: ConvertQueryDto) {
    const r = await this.fx.convert(m2(q.amount), q.from, q.to);
    return { amount: m2(q.amount), from: q.from, to: q.to, rate: r.rate, converted: r.converted, asOf: iso(r.asOf), source: r.source };
  }
}
