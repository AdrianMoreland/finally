import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { BonusDto, SetTaxCheckDto, TaxDto, UpdateBonusDto, UpdateTaxDto } from '../common/app-dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { TaxService } from './tax.service';

@ApiTags('tax')
@ApiBearerAuth()
@Controller()
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  /** Tax credits, payroll perks, the pay checker, take-home and the rules in force. `slip` picks which payday to check. */
  @Get('tax')
  @ZodSerializerDto(TaxDto)
  get(@CurrentUser() user: AuthUser, @Query('slip') slip?: string) {
    return this.tax.get(user.id, slip);
  }

  @Put('tax')
  @ZodSerializerDto(TaxDto)
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateTaxDto) {
    return this.tax.update(user.id, body);
  }

  @Put('tax/checks/:itemId')
  @ZodSerializerDto(TaxDto)
  setCheck(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string, @Body() body: SetTaxCheckDto) {
    return this.tax.setCheck(user.id, itemId, body.state);
  }

  @Get('bonus')
  @ZodSerializerDto(BonusDto)
  bonus(@CurrentUser() user: AuthUser) {
    return this.tax.bonus(user.id);
  }

  @Put('bonus')
  @ZodSerializerDto(BonusDto)
  updateBonus(@CurrentUser() user: AuthUser, @Body() body: UpdateBonusDto) {
    return this.tax.updateBonus(user.id, body);
  }
}
