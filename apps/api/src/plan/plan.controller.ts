import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { PaydayPlanDto, SetOrderDto, UpdatePlanSettingsDto } from '../common/app-dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { PlanService } from './plan.service';

@ApiTags('plan')
@ApiBearerAuth()
@Controller('plan')
export class PlanController {
  constructor(private readonly plan: PlanService) {}

  @Get('payday')
  @ZodSerializerDto(PaydayPlanDto)
  payday(@CurrentUser() user: AuthUser) {
    return this.plan.get(user.id);
  }

  /** Tell Finally what you set up at the bank (`null` clears it). */
  @Put('orders/:key')
  @ZodSerializerDto(PaydayPlanDto)
  setOrder(@CurrentUser() user: AuthUser, @Param('key') key: string, @Body() body: SetOrderDto) {
    return this.plan.setOrder(user.id, key, body.amount);
  }

  @Put('settings')
  @ZodSerializerDto(PaydayPlanDto)
  settings(@CurrentUser() user: AuthUser, @Body() body: UpdatePlanSettingsDto) {
    return this.plan.updateSettings(user.id, body);
  }
}
