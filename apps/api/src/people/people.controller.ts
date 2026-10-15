import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { CreatePersonDto, CreatePersonPaymentDto, PeopleDto, UpdatePaybackPlanDto, UpdatePersonDto } from '../common/app-dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { PeopleService } from './people.service';

@ApiTags('people')
@ApiBearerAuth()
@Controller('people')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @ZodSerializerDto(PeopleDto)
  get(@CurrentUser() user: AuthUser) {
    return this.people.get(user.id);
  }

  @Post()
  @ZodSerializerDto(PeopleDto)
  create(@CurrentUser() user: AuthUser, @Body() body: CreatePersonDto) {
    return this.people.create(user.id, body);
  }

  /** How much goes to paying people back each payday, and in what order. */
  @Put('plan')
  @ZodSerializerDto(PeopleDto)
  updatePlan(@CurrentUser() user: AuthUser, @Body() body: UpdatePaybackPlanDto) {
    return this.people.updatePlan(user.id, body);
  }

  @Patch(':id')
  @ZodSerializerDto(PeopleDto)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdatePersonDto) {
    return this.people.update(user.id, id, body);
  }

  @Delete(':id')
  @ZodSerializerDto(PeopleDto)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.people.remove(user.id, id);
  }

  @Post(':id/payments')
  @ZodSerializerDto(PeopleDto)
  addPayment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: CreatePersonPaymentDto) {
    return this.people.addPayment(user.id, id, body);
  }

  @Delete(':id/payments/:paymentId')
  @ZodSerializerDto(PeopleDto)
  removePayment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('paymentId') paymentId: string) {
    return this.people.removePayment(user.id, id, paymentId);
  }
}
