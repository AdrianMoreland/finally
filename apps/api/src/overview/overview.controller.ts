import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { OverviewDto } from '../common/dto';
import { CurrentUser, type AuthUser } from '../common/tokens';
import { OverviewService } from './overview.service';

@ApiTags('overview')
@ApiBearerAuth()
@Controller('overview')
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  @ZodSerializerDto(OverviewDto)
  get(@CurrentUser() user: AuthUser) {
    return this.overview.get(user.id);
  }
}
