import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import {
  CreateInstrumentDto,
  CreateLotDto,
  InstrumentDto,
  InstrumentListDto,
  InvestmentsDto,
  LotDto,
  LotListDto,
  OkDto,
  PriceSeriesDto,
  PriceSeriesQueryDto,
  SignalListDto,
  TaxRuleListDto,
  UpdateInstrumentDto,
  UpdateLotDto,
} from '../common/dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { InvestmentsService } from './investments.service';

@ApiTags('investments')
@ApiBearerAuth()
@Controller()
export class InvestmentsController {
  constructor(private readonly inv: InvestmentsService) {}

  @Get('investments')
  @ZodSerializerDto(InvestmentsDto)
  summary(@CurrentUser() user: AuthUser) {
    return this.inv.summary(user.id);
  }

  @Get('investments/signals')
  @ZodSerializerDto(SignalListDto)
  signals(@CurrentUser() user: AuthUser) {
    return this.inv.listSignals(user.id);
  }

  @Get('investments/tax-rules')
  @ZodSerializerDto(TaxRuleListDto)
  taxRules(@CurrentUser() user: AuthUser) {
    return this.inv.taxRuleDtos(user.id);
  }

  @Get('instruments')
  @ZodSerializerDto(InstrumentListDto)
  instruments(@CurrentUser() user: AuthUser) {
    return this.inv.listInstruments(user.id);
  }

  @Post('instruments')
  @ZodSerializerDto(InstrumentDto)
  createInstrument(@CurrentUser() user: AuthUser, @Body() body: CreateInstrumentDto) {
    return this.inv.createInstrument(user.id, body);
  }

  @Patch('instruments/:id')
  @ZodSerializerDto(InstrumentDto)
  updateInstrument(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateInstrumentDto) {
    return this.inv.updateInstrument(user.id, id, body);
  }

  @Delete('instruments/:id')
  @HttpCode(200)
  @ZodSerializerDto(OkDto)
  async deleteInstrument(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.inv.deleteInstrument(user.id, id);
    return { ok: true as const };
  }

  @Get('instruments/:id/prices')
  @ZodSerializerDto(PriceSeriesDto)
  prices(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() q: PriceSeriesQueryDto) {
    return this.inv.priceSeries(user.id, id, q.days);
  }

  @Get('lots')
  @ZodSerializerDto(LotListDto)
  lots(@CurrentUser() user: AuthUser, @Query('instrumentId') instrumentId?: string) {
    return this.inv.listLots(user.id, instrumentId);
  }

  @Post('lots')
  @ZodSerializerDto(LotDto)
  createLot(@CurrentUser() user: AuthUser, @Body() body: CreateLotDto) {
    return this.inv.createLot(user.id, body);
  }

  @Patch('lots/:id')
  @ZodSerializerDto(LotDto)
  updateLot(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateLotDto) {
    return this.inv.updateLot(user.id, id, body);
  }

  @Delete('lots/:id')
  @HttpCode(200)
  @ZodSerializerDto(OkDto)
  async deleteLot(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.inv.deleteLot(user.id, id);
    return { ok: true as const };
  }
}
