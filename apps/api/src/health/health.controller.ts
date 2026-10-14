import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Db } from '@finally/db';
import { Public } from '../common/public.decorator';
import { InjectDb } from '../common/tokens';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectDb() private readonly db: Db) {}

  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    await this.db.$queryRaw`select 1`;
    return { status: 'ok', time: new Date().toISOString() };
  }
}
