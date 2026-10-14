import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import type { Db } from '@finally/db';
import { askCategoryId } from '@finally/contracts';
import { eur } from '@finally/finance-core';
import { OkDto, RegisterDeviceDto, TestNotificationDto } from '../common/dto';
import { CurrentUser, InjectDb, type AuthUser } from '../common/tokens';
import { PushService } from './push.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly push: PushService,
  ) {}

  /** Public VAPID key the web client needs to subscribe to Web Push. */
  @Get('notifications/vapid-key')
  vapid() {
    return { publicKey: this.push.vapidPublicKey };
  }

  @Post('devices')
  @ZodSerializerDto(OkDto)
  async register(@CurrentUser() user: AuthUser, @Body() body: RegisterDeviceDto) {
    await this.db.pushDevice.upsert({
      where: { userId_token: { userId: user.id, token: body.token } },
      update: { platform: body.platform, lastSeenAt: new Date() },
      create: { userId: user.id, platform: body.platform, token: body.token },
    });
    return { ok: true as const };
  }

  @Delete('devices')
  @ZodSerializerDto(OkDto)
  async unregister(@CurrentUser() user: AuthUser, @Body() body: RegisterDeviceDto) {
    await this.db.pushDevice.deleteMany({ where: { userId: user.id, token: body.token } });
    return { ok: true as const };
  }

  /**
   * Sends a sample ask-me push to the user's devices and returns its content, so a client can also show it
   * as a local notification (with the three category buttons) when no push server is available.
   */
  @Post('notifications/test')
  @ZodSerializerDto(TestNotificationDto)
  async test(@CurrentUser() user: AuthUser) {
    const sample = {
      title: 'What was this payment?',
      body: `${eur(4.2)} at Bewley's Grafton St — what was it?`,
      categoryIdentifier: askCategoryId('FOOD'),
      data: { requestId: 'test', merchantKey: 'bewleys-grafton-st', askGroup: 'FOOD', test: 'true' },
    };
    const res = await this.push.send(user.id, { kind: 'test', ...sample });
    return { sent: res.sent, sample };
  }
}
