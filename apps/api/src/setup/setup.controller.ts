import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { CompleteSetupDto, FoundDto } from '../common/app-dto';
import { OkDto } from '../common/dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { SetupService } from './setup.service';

@ApiTags('setup')
@ApiBearerAuth()
@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  /** What Finally found in your payment history: salary, rent, housemates, repeating bills, suggested budgets. */
  @Get('found')
  @ZodSerializerDto(FoundDto)
  found(@CurrentUser() user: AuthUser) {
    return this.setup.found(user.id);
  }

  @Post('complete')
  @HttpCode(200)
  @ZodSerializerDto(OkDto)
  complete(@CurrentUser() user: AuthUser, @Body() body: CompleteSetupDto) {
    return this.setup.complete(user.id, body);
  }
}
