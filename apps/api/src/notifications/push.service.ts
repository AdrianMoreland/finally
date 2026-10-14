import { Inject, Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import type { Db } from '@finally/db';
import type { PushPayload } from '@finally/contracts';
import { ENV, type Env } from '../common/env';
import { InjectDb } from '../common/tokens';
import { isQuietHours } from './quiet-hours';

export interface SendOptions {
  /** Skip sending during the user's quiet hours; the caller decides what to do with `deferred`. */
  respectQuietHours?: boolean;
  now?: Date;
}

export interface SendResult {
  sent: number;
  deferred: boolean;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  private readonly webPushReady: boolean;

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.webPushReady = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    if (this.webPushReady) {
      webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    }
  }

  get vapidPublicKey(): string | null {
    return this.env.VAPID_PUBLIC_KEY ?? null;
  }

  async send(userId: string, payload: PushPayload, opts: SendOptions = {}): Promise<SendResult> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { quietHoursStart: true, quietHoursEnd: true },
    });
    if (!user) return { sent: 0, deferred: false };
    if (opts.respectQuietHours && isQuietHours(opts.now ?? new Date(), user.quietHoursStart, user.quietHoursEnd)) {
      return { sent: 0, deferred: true };
    }
    const devices = await this.db.pushDevice.findMany({ where: { userId } });
    let sent = 0;
    const expo = devices.filter((d) => d.platform !== 'WEB');
    const web = devices.filter((d) => d.platform === 'WEB');
    if (expo.length) sent += await this.sendExpo(expo, payload);
    if (web.length) sent += await this.sendWeb(web, payload);
    return { sent, deferred: false };
  }

  private async sendExpo(devices: Array<{ id: string; token: string }>, p: PushPayload): Promise<number> {
    const messages = devices.map((d) => ({
      to: d.token,
      title: p.title,
      body: p.body,
      data: { kind: p.kind, ...p.data },
      sound: 'default',
      ...(p.categoryIdentifier ? { categoryId: p.categoryIdentifier } : {}),
    }));
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${this.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        this.log.warn(`Expo push failed: HTTP ${res.status}`);
        return 0;
      }
      const json = (await res.json()) as { data?: ExpoTicket[] };
      let ok = 0;
      const dead: string[] = [];
      (json.data ?? []).forEach((t, i) => {
        if (t.status === 'ok') ok++;
        else if (t.details?.error === 'DeviceNotRegistered' && devices[i]) dead.push(devices[i].id);
      });
      if (dead.length) await this.db.pushDevice.deleteMany({ where: { id: { in: dead } } });
      return ok;
    } catch (err) {
      this.log.warn(`Expo push error: ${(err as Error).message}`);
      return 0;
    }
  }

  private async sendWeb(devices: Array<{ id: string; token: string }>, p: PushPayload): Promise<number> {
    if (!this.webPushReady) return 0;
    let ok = 0;
    for (const d of devices) {
      try {
        await webpush.sendNotification(JSON.parse(d.token) as webpush.PushSubscription, JSON.stringify(p));
        ok++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await this.db.pushDevice.delete({ where: { id: d.id } }).catch(() => undefined);
        else this.log.warn(`Web push error: ${(err as Error).message}`);
      }
    }
    return ok;
  }
}
