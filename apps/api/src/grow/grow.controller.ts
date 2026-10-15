import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { AddVaultDto, FreedomDto, InvestingPlanDto, PaperDto, PaperTradeDto, UpdateFreedomDto, UpdateInvestingDto, VaultDto } from '../common/app-dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { GrowService } from './grow.service';

@ApiTags('grow')
@ApiBearerAuth()
@Controller('grow')
export class GrowController {
  constructor(private readonly grow: GrowService) {}

  /** Readiness checklist, Investment Account countdown, mix vs target and the wrapper comparison. */
  @Get('investing')
  @ZodSerializerDto(InvestingPlanDto)
  investing(@CurrentUser() user: AuthUser) {
    return this.grow.investing(user.id);
  }

  @Put('investing')
  @ZodSerializerDto(InvestingPlanDto)
  updateInvesting(@CurrentUser() user: AuthUser, @Body() body: UpdateInvestingDto) {
    return this.grow.updateInvesting(user.id, body);
  }

  @Get('freedom')
  @ZodSerializerDto(FreedomDto)
  freedom(@CurrentUser() user: AuthUser) {
    return this.grow.freedom(user.id);
  }

  @Put('freedom')
  @ZodSerializerDto(FreedomDto)
  updateFreedom(@CurrentUser() user: AuthUser, @Body() body: UpdateFreedomDto) {
    return this.grow.updateFreedom(user.id, body);
  }

  @Get('paper')
  @ZodSerializerDto(PaperDto)
  paper(@CurrentUser() user: AuthUser) {
    return this.grow.paper(user.id);
  }

  /** Practise with fake money: buy, sell, skip a month, or answer the wait rule. */
  @Post('paper')
  @ZodSerializerDto(PaperDto)
  trade(@CurrentUser() user: AuthUser, @Body() body: PaperTradeDto) {
    return this.grow.trade(user.id, body);
  }

  @Get('vault')
  @ZodSerializerDto(VaultDto)
  vault(@CurrentUser() user: AuthUser) {
    return this.grow.vault(user.id);
  }

  @Post('vault')
  @ZodSerializerDto(VaultDto)
  addVault(@CurrentUser() user: AuthUser, @Body() body: AddVaultDto) {
    return this.grow.addVault(user.id, body.product, body.qty);
  }

  @Delete('vault/:index')
  @ZodSerializerDto(VaultDto)
  removeVault(@CurrentUser() user: AuthUser, @Param('index', ParseIntPipe) index: number) {
    return this.grow.removeVault(user.id, index);
  }
}
